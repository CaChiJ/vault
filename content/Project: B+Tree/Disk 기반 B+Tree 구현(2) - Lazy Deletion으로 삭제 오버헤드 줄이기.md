---
publish: true
title: Disk 기반 B+Tree 구현(2) - Lazy Deletion
modified: 2025-11-10T23:35:45+09:00
cssclasses: ""
---

# 1. 잦은 Deletion의 오버헤드
- "Delete할 때마다 Coalesce/Redistribute를 하는 게 정말 효율적인가?"
- 이전 글에서 구현한 기존 방식(Bptree 1)의 Delete는 매번 Sibling을 조회하고 Coalesce 또는 Redistribute를 수행하며, 이를 재귀적으로 부모까지 전파한다.
- 이 과정은 삭제 1건마다 여러 페이지를 읽고 쓰게 만든다. (현재 리프, 형제 리프, 부모, 경우에 따라 상위 부모까지)
- 특히 디스크 기반 구조에서는 이런 상향 전파가 랜덤 I/O를 반복적으로 유발해, 키 삭제가 몰리는 구간에서 체감 성능이 크게 떨어졌다.
- 이 과정에서 발생하는 비용이 비효율적이라고 판단하여, Delete할 때마다 Coalesce/Redistribute를 수행하는 대신 Deletion Bitmap을 이용한 Lazy Deletion으로 개선하였다.

# 2. Deletion Bitmap을 이용한 Lazy Deletion
- 기본적인 구현은 Bptree 1과 같지만, 리프 노드의 reserved 공간에 `deletion_bitmap` 필드를 만들어 이를 이용해 삭제 여부를 판단한다.

#### ◼️ Delete
- 삭제할 때는 이 플래그의 특정 비트를 1로 변경하여, 삭제된 것으로 간주한다.
```c
set_deleted(leaf_page, record_idx, 1);
write_page(leaf_page, leaf_offset);
```

#### ◼️ Find
- Bptree 1과 동일하게 Key 값을 찾지만, 찾은 레코드에 대해 `deletion_bitmap` 필드를 검사해 삭제 여부를 판단하는 로직이 추가되었다.
- 만약 Key에 대응되는 리프 노드의 레코드가 있지만 deletion_bitmap에서 해당 레코드의 비트가 `1`로 설정된 경우 Not Exist로 처리한다.
```c
if (check_is_deleted(leaf_page, record_idx)) {
	free(result);
	free(leaf_page);
	return NULL;
}
return result;
```

#### ◼️ Insert
- Key/Value를 추가하고, 그에 대응되는 deletion_bitmap의 비트를 `0` 으로 설정한다.
- 만약 이미 노드가 삽입되어 있지만, deletion_bitmap의 비트가 `1`로 설정되어 있다면, (즉, 삭제 처리된 노드라면) 재활용하여 value만 변경하고 deletion_bitmap의 비트를 `0`으로 변경한다.
```c
if (check_is_deleted(leaf_page, record_idx)) {
	// 삭제 처리된 노드 -> 재활용
	set_deleted(leaf_page, record_idx, 0);
	strcpy(leaf_page->records[record_idx].value, value);
```
- 만약 리프 노드의 크기가 최대 레코드 개수보다 커지게 되어 새로운 리프 노드를 생성해 분할할 때에는 비트맵도 함께 분할한다.
```c
// 왼쪽 리프 노드에 값을 대입한다.
for (int i = split - 1; i >= 0; --i, --j) {
	// ... (왼쪽 리프 노드에 값 복사) ...
	set_deleted(leaf_page, i, check_is_deleted_by_bitmap(prev_bitmap, j));
}
```

# 3. 논리적 삭제 vs 물리적 삭제
- 삭제 동작 시 bitmap에 대한 조작만 일어나며, quit을 실행하여 reorganize 작업이 수행된 후에 파일에서 데이터가 제거된다.
- 즉, 현재 프로세스가 도는 동안에는 그냥 안 보일 뿐이고 공간을 여전히 점유하고 있다. → **DB Bloat 문제가 발생한다.**
- 때문에 삭제 이후 특정 시점에, 뒷단에서 Reorganization 작업을 통해 죽은 데이터를 물리적으로 삭제하는 단계가 필요하다. (다음 글에서 이에 대한 구현을 살펴본다.)
- 다음과 같은 추가 출력을 삽입해 `Logically deleted` 상태에서 `Physically not exist` 상태로 전환되었는지 실제로 확인할 수 있다.
```c
if (result == NULL) {
	printf("It is Physically not exist\n");
	return NULL;
}

if (check_is_deleted(leaf_page, record_idx)) {
	printf("It is logically deleted\n");
	return NULL;
}
```
- 이 상태에서 5를 추가하고 지우면 프로그램이 `It is logically deleted`를 반환한다.
