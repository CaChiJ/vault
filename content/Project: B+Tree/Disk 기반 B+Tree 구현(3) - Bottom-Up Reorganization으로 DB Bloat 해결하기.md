---
publish: true
title: Disk 기반 B+Tree 구현(3) - Bottom-Up Reorganization
modified: 2025-11-14T23:35:45+09:00
cssclasses: ""
---


이전 글에서 Lazy Deletion의 도입으로 Delete 시의 병합 오버헤드를 완전히 쳐냈지만, 대신 불필요한 레코드 찌꺼기가 파일에 누적된다는 단점(DB Bloat)이 생겼다.
프로그램을 `quit`하며 DB를 닫을 때, 이렇게 쌓인 Dead 플래그 엔트리들을 어떻게 털어내고 DB 파일을 압축(Reorganize)할 것인가에 대한 구현과 성능 최적화 과정을 다룬다. (PostgreSQL의 autovacuum full과 유사한 작업을 수행하여 개선한다)

# 1. 접근 방식: Bottom-Up Reorganization
- Top-Down 방식(정렬된 데이터를 다시 한 건씩 Insert)으로 재구성하면, 트리를 반복 탐색하며 페이지를 여기저기 건드리게 되어 랜덤 I/O가 크게 늘어난다.
- 반대로 Bottom-Up 방식은 리프부터 순서대로 새 파일에 채워 넣기 때문에 쓰기 패턴이 거의 순차 I/O로 바뀐다.
- 디스크 기반 환경에서는 이 차이가 크게 작용했고, 실제 실험에서도 재구성 시간 단축 효과를 확인할 수 있었다.

- Bottom-up 방식으로, 새로운 파일을 생성한 뒤 모든 리프 노드들을 deletion_bitmap을 체킹하며 순차적으로 삽입한다.
- 이때, 두 개의 버퍼를 유지한다. (마지막 리프 노드 처리 과정의 성능 최적화 목적)
- 첫 번째 버퍼부터 모두 채운 뒤 두 번째 버퍼를 채운다. 만약 두 번째 버퍼가 리프 노드의 최소 레코드 개수 기준을 만족하면 첫 번째 버퍼를 Flush(새로운 파일에 Write) 한다.
- 모든 리프 레코드를 읽은 후에는 `flush_last_leaf_buffers`를 호출한다. 이 함수는 Bottom-Up reorganize 과정에서 한 페이지를 가득 채우지 못하는 양의 요소들이 남았을 가능성에 대비해, 요소의 개수에 따라 다음 중 하나를 적절히 선택해 Rebalancing한다.
	- (Case 1) 마지막 페이지까지 하나의 페이지를 모두 가득 채우는 경우 > 리밸런싱 필요 X
	- (Case 2) 마지막 페이지에 절반 이하의 요소만 들어가는 경우 > B+ Tree의 조건을 만족시키기 위해 바로 앞 페이지에서 요소를 가져온다.
	- (Case 3) 마지막 페이지에 절반 이상의 요소가 들어가는 경우 > B+ 리밸런싱 필요 X
- 트리 상에서 레벨을 올려가며 1개의 노드(루트)만이 존재하는 레벨이 나올 때까지 하위 레벨의 노드들에 대한 Parent Node들을 생성해 삽입한다.
- 임시 DB 파일을 생성하여 작업한 후, 기존 DB 파일을 삭제하고 생성한 DB 파일로 대체한다. (`rename(TEMP_DB_PATH, real_path);`)

# 2. Page I/O 최적화에 대한 고찰
#### ◼️ Page I/O 최적화 1: min_key
- internal node들을 생성할 때, 특정 자식 노드에 대한 key 값을 찾으려면 리프 노드까지 탐색을 수행하여 리프노드의 가장 작은 key 값을 가져와야 한다는 문제가 있었다.
- 이는 모든 internal node마다 $(트리 \space 높이 \space h) \times (노드의 \space 포인터 \space 개수 \space N_p)$ 에 비례하는 Random한 페이지 Read 연산이 일어남을 의미하므로, 성능에 큰 악영향을 미친다.
- 이를 해결하기 위해 최초에 리프 노드를 불러올 때, 각각의 리프 노드마다 reserved 공간에 가장 작은 키 값(`min_key`)을 저장하도록 하였다.
- 이를 통해 리프 노드까지 탐색할 필요 없이, 바로 아래 자식의 페이지만 Read하여 해당 페이지의 `min_key` 값을 가져올 수 있도록 최적화 하였다.

#### ◼️ Page I/O 최적화 2: parent_offset 예측
- Bottom-Up 방식에서 가장 큰 걸림돌은 특정 노드를 삽입할 때, 해당 노드의 부모 노드 오프셋(parent_offset)이 정해지지 않았다는 점이다.
- 이 때문에 부모 노드가 삽입되어 오프셋이 결정된 후에 다시 각각의 자식 노드를 Read한 뒤, parent_offset을 부모 노드 오프셋으로 변경한 뒤 다시 Write해야 한다는 문제가 있었다. (전체 노드 개수에 비례하는 Page write 연산 발생)
- 이를 계산하여 채우기 위해 오프셋을 다음 그림과 같은 규칙에 따라 지정하도록 미리 약속하였다.

![[Pasted image 20251116143148.png]]

- 이를 이용하면 자식 노드는 `현재 레벨 노드 개수` 와 `하위 레벨까지 전체 노드 개수`, `현재 레벨에서 자신의 위치` 세 가지 값을 이용해 부모 노드의 오프셋을 사전에 추정할 수 있다.
- 다만 이 방식은 Leaf node에 대한 부모 노드를 구할 때 미리 모든 Leaf 노드를 1회 순회하며 전체 Leaf node 개수를 구해야 한다는 단점이 있었다.

#### ◼️ Page I/O 최적화 3: active_key_count
- 앞선 전체 리프 노드에 대한 Read 연산을 없애기 위해, 평소에 Header Page 내의 Reserved 공간에 삭제되지 않은 키의 총 개수를 미리 저장해 관리한다.
```c
typedef struct Header_Page{
	uint64_t active_key_count; // 삭제되지 않은 키의 총 개수
	char reserved[4064];
}H_P;
```
- 값이 Insert/Delete될 때마다 이 값을 계속해서 업데이트한다. 
- 종료 시 이 값을 이용해 전체 리프 노드에 대한 비트맵 연산(별도의 페이지 Read) 없이도 필요한 리프 페이지 개수를 즉시 추정할 수 있다.
```c
// (개선 전) 모든 리프 노드에 대한 비트맵 연산 → 리프 페이지 개수에 비례하는 횟수의 무작위 페이지 Read 발생
// uint64_t total_key_count = get_total_key_count(current_node);

// (개선 후) 별도의 페이지 Read 필요 X
uint64_t total_key_count = hp->active_key_count;
```

최종적으로 Reorganize (Bottom-up) 연산의 소요 시간은 다음과 같다.
```
환경: m1 pro(8c), 16GB, 그 외 채점환경과 동일
Average time: 0.025s
Min time: 0.000471s
Max time: 0.242710s
```
