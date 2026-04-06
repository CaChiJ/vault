---
publish: true
title: Disk 기반 B+Tree 구현(4) - Sort Merge Join
modified: 2025-11-25T16:46:38+09:00
cssclasses: ""
---


# 1. 왜 Merge Join인가?
- 디스크 기반 B+ Tree 시스템에서 두 테이블 간의 Natural Join을 수행해야 하는 요건이 주어졌다.
- 주어진 두 테이블의 리프 노드들은 이미 `key`를 기준으로 정렬되어 있는 상태이다.
- Natural Join 수행 시 항상 Clustering Key인 이 `key` 필드를 기준으로 조인이 엮이게 된다.
- 따라서 각 DB의 바닥을 구성하는 리프 노드들을 페이지(Page) 단위로 밀면서 차례대로 비교하는 **Merge Join** 방식이 가장 효율적이라고 생각했고, 결과적으로 전체 I/O 오버헤드를 딱 $리프노드개수_{table1} + 리프노드개수_{table2}$ 스캔 비용 수준으로 억제할 수 있을 것이라 기대했다.

# 2. 구현
- `db_join`을 호출하면 각각의 노드들을 맨 앞단 리프 엣지로 이동시킨 다음, 각 체인을 나란히 돌면서 Sort Merge 알고리즘을 태운다. 양쪽 모두 정렬되어 있기 때문에 앞서간 인덱스를 쫓아가는 식으로 한쪽의 포인터만 전진시키면 된다.

```c
void db_join()
{
	...
	// 각 테이블의 첫 번째 노드(페이지) 로드
	off_t leaf_off_1 = find_leaf_from(INT64_MIN, fd, hp, rt);
	off_t leaf_off_2 = find_leaf_from(INT64_MIN, fd2, hp2, rt2);

	// (Sort) Merge Join 수행

	while (leaf_page_1 != NULL && leaf_page_2 != NULL) {
		int64_t key1 = leaf_page_1->records[idx1].key;
		int64_t key2 = leaf_page_2->records[idx2].key;

		if (key1 == key2) {
			// matching 성공 - 결과 출력
			printf("%ld,%s,%s\n", key1, leaf_page_1->records[idx1].value, leaf_page_2->records[idx2].value);
			idx1++;
			idx2++;
		} else if (key1 < key2) {
			idx1++;
		} else {
			idx2++;
		}

		if (leaf_page_1->num_of_keys <= idx1) {
			// 다음 페이지로 교체
			...
		}

		if (leaf_page_2->num_of_keys <= idx2) {
			// 다음 페이지로 교체
			...
		}
	}
}
```