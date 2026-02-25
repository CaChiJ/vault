---
publish: true
title: Disk 기반 B+Tree 구현(1) - Find, Insert, Delete
modified: 2025-11-14T23:35:45+09:00
tags:
  - "#작성필요"
cssclasses: ""
---


#작성필요 - 프로젝트 배경 설명(C, 디스크 기반, 페이지 단위 I/O) - pwrite, pread, 4096 byte page

# 1. B+Tree 기본 연산 구현
#### ◼️ Find
- 루트 페이지부터 key 값을 탐색하며 리프 노드를 찾아 탐색을 수행한다.
- 리프 노드를 찾으면 Key에 해당하는 레코드를 찾아 Value를 반환한다.
- 루트 페이지에서 시작해 인자로 주어진 키가 위치할 가능성이 있는 리프 페이지를 찾은 후, 리프 페이지 내의 레코드 엔트리를 순회하며 `key`에 대응되는 엔트리를 찾는다.

```c
// 위치할 가능성이 있는 리프 노드까지 탐색
page * leaf_page = find_leaf_page(root_page, root_offset, key, out_leaf_offset);

for (int i = 0; i < leaf_page->num_of_keys; ++i) {
	if (leaf_page->records[i].key == key) {
		return result;
	}
}
```

#### ◼️ Insert
- 먼저, Key가 위치할 수 있는 리프 노드를 찾는다.
- 찾은 리프 노드에 대해 value가 이미 존재하는지 검사한다.
- Leaf 노드에 남은 공간이 있다면 Key/Value를 삽입하되, 만약 Leaf 노드의 레코드 개수가 최대 레코드 개수를 초과하게 된다면 리프 노드를 두 개로 분할한 뒤 Key를 삽입한다.
- Leaf 노드를 두 개로 나눈 후 기존 리프 노드의 엔트리들을 절반씩 나누어 담는다. 이때 새롭게 삽입하는 엔트리를 둘 중 적절한 위치에 삽입한다.

```c
// 왼쪽 리프 노드에 값을 대입한다.
for (int i = split - 1; i >= 0; --i, --j) {
	if (i == insertion_index) {
		j++;
		continue;
	}
	leaf_page->records[i].key= temp[j].key;
	strcpy(leaf_page->records[i].value, temp[j].value);
}

// 새로운 값을 왼쪽 노드와 오른쪽 노드 중 적절한 위치에 삽입한다.
if (insertion_index >= split) {
	new_leaf->records[insertion_index - split].key = key;
	strcpy(new_leaf->records[insertion_index - split].value, value);
} else {
	leaf_page->records[insertion_index].key = key;
	strcpy(leaf_page->records[insertion_index].value, value);
}
```

- Leaf 노드를 분할한 경우 부모 노드에 새롭게 생성된 리프 노드에 대한 포인터를 추가한다.
- 만약 Internal Node 엔트리 개수가 최대 엔트리 개수를 초과하게 된다면 재귀적으로 Internal Node를 두 개로 분할한 뒤 부모 노드에 새로운 Internal Node에 대한 포인터를 추가한다.

#### ◼️ Delete
- 먼저, Key가 위치할 수 있는 리프 노드를 찾는다.
- Leaf 노드에서 Key에 해당되는 레코드를 찾아 제거한다.
- 리프 노드에서 Key를 삭제했을 때 남게 될 레코드 개수가 최소 레코드 개수 이상이라면 엔트리를 삭제하고 작업을 종료한다.
- 만약 Leaf 노드의 레코드 개수가 최소 레코드 개수보다 작다면 Coalesce 또는 Redistribute를 시도해야 한다.
- 이를 위해 부모노드를 조회해 Sibling 노드를 찾는다.
- Sibling 노드의 레코드 개수와 현재 리프 노드의 레코드 개수를 더했을 때 최대 레코드 개수를 초과하지 않는다면 Coalesce를 수행하고, 초과한다면 Redistribute를 수행한다.

```c
if (neighbor_page->num_of_keys + leaf_page->num_of_keys <= LEAF_MAX) {
	// (merge) sibling과 leaf_page(current)의 레코드를 합친다.
	coalesce_leaf(parent_page, parent_page_offset, leaf_page, leaf_offset, current_idx_on_parent, neighbor_page, neighbor_offset, neighbor_idx_on_parent, is_neighbor_left);
} else {
	// (redistribute) sibling에서 레코드를 하나 꺼내서 leaf_page(current)에 삽입한다.
	redistribute_leaf_page(parent_page, neighbor_page, neighbor_idx_on_parent, leaf_page, current_idx_on_parent);
}
```

- Coalesce를 수행한 이후에는 부모 노드에서 삭제된 노드를 가리키는 Key/Offset 엔트리를 제거한다. 이 과정 또한 리프 노드에 대한 Delete 연산과 동일하게 재귀적으로 수행한다.

# 2. Trouble Shooting

#### ◼️ Global Variable 관리
- root에 대한 write가 수행되는 경우, 반드시 global variable의 Header Page와 Root Page를 변경해주어야 한다.
- 하지만 매번 write할 때마다 root인지 체크하는지 확인하는 것은 번거롭고 실수하기 쉬웠다.
- Solid하게 전역 변수를 관리하고자 `write_page` 함수를 만들어, 이 함수 내부에서 자동으로 루트 여부를 판별하고 전역 변수를 업데이트하게 하였다.

```c
void write_page(page * p, off_t offset) {
	pwrite(fd, p, sizeof(page), offset);
	if (offset == hp->rpo && rt != NULL) {
		free(rt);
		rt = load_page(hp->rpo);
	}
}
```

#### ◼️ Memory Leak
- `fsanitize=address` (ASan)를 적용하여 20,000건의 Insert/Delete 테스트케이스를 돌려본 결과, Peak Memory 사용량이 10MB를 넘어가는 경우가 발생했다. 
- 원인은 대부분 함수 간에 포인터를 넘겨줄 때, 누가 해당 메모리를 `free`할지 책임이 명확하지 않아 발생한 문제였다. 또한 Caller가 인자로 넘긴 동적 변수가 구조상 그대로 리턴되어 사용되는 경우도 있었기에 Caller는 섣불리 메모리를 해제할 수 없었다.
- 이를 해결하기 위해, 처음에는 C++의 Smart Pointer나 자체적인 GC를 구현하는 방향으로 고민했다. 그러나 아직 DB 코드베이스가 작기 때문에 그에 따른 복잡성이 부담스럽게 느껴졌다.
- 더 간단하게 해결하기 위해, 함수의 인자와 반환값을 해제할 책임을 철저히 Caller가 갖게 하는 원칙을 세웠다.
- Callee는 인자 값을 그대로 반환해야 하는 경우, 책임을 명확히 분리하기 위해 새로운 힙 공간을 할당해 데이터를 복사한 뒤 반환하게 하였다.
- 그 결과 Caller가 동적 할당된 공간을 안전하게 회수할 수 있게 되어 10MB 이상의 Memory Leak을 제거하였다.
