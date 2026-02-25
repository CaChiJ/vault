---
publish: true
title: PostgreSQL이 UPDATE를 처리하는 방식
modified: 2026-02-25T11:59:21.098+09:00
cssclasses: ""
---

# 1. PostgreSQL에서의 MVCC
- 데이터를 수정할 때 덮어쓰지 않고 새 버전을 만들어서, 여러 버전을 동시에 유지한다.
- 각 트랜잭션(또는 SELECT)은 자신만의 일관된 시점의 스냅샷을 보므로, 다른 트랜잭션의 변경사항에 영향받지 않는다.
- 덕분에 읽기 작업이 쓰기를 막지 않고, 쓰기 작업이 읽기를 막지 않아 동시성이 크게 향상된다.
- 이를 위해 PostgreSQL에서는 각 튜플에 `xmin`과 `xmax` 플래그를 함께 저장한다.
- 이는 과거를 기억해서 각자 필요한 시점의 데이터를 보여주는 기술이다.

# 2. HOT Update
- PostgreSQL은 MVCC를 위해 튜플이 Update될 때마다 이전 튜플을 유지하면서 새로운 튜플을 동일 페이지 내에 삽입한다.
- 근데 그냥 새로운 튜플을 삽입하기만 하면, 해당 테이블의 모든 인덱스 엔트리가 가리키는 포인터도 업데이트 해줘야 한다 → 상당한 오버헤드
- 때문에 다음과 같은 방식으로 동작한다.
	1. 이전 튜플에 삭제 마크를 설정하고, 동일한 페이지 안에 새로운 튜플을 삽입한다.
	2. 이전 튜플이 새 튜플의 위치를 가리키는 포인터(`t_cid`) 를 저장한다 (HOT Chain 형성).
	3. 인덱스는 HOT Chain의 Head(첫 번째 LP)만 가리키며, 이후 버전들은 한 페이지 안에서 연결 리스트 형태로 관리된다.
- 한 페이지 내에 충분한 공간이 있어야 하므로, PostgreSQL에서는 Fill Factor를 의도적으로 낮게 조정하여, UPDATE를 위한 공간을 확보할 수 있다.

# 3. DB Bloat
- 그런데 PostgreSQL의 MVCC 특성상, 인덱스에 있는 엔트리를 삭제할 때나 이전 버전의 튜플에 대해 fill factor에 따른 redistribute나 coalesce를 수행하지 않는다.
	- 다시 말해, 한 페이지에 튜플이 딱 하나 있어도 신경쓰지 않는다.
- 때문에 실질적으로 사용되는 튜플은 거의 없지만 사용하는 페이지는 엄청나게 많은 상황이 생길 수 있다. 이를 DB Bloat이라고 부른다.
- DB Bloat을 해결하는 방법으로는 VACUUM FULL과 같은 옵션을 통해 Reconstruction하는 방법이 있다. 하지만 이는 테이블과 인덱스 자체에 대한 ACCESS EXCLUSIVE 락을 걸어버리므로, downtime에 유의해야 한다.
- 이를 해결하는 대안으로는 `pg_repack`이 있다.
	- 쉽게 말해, 로그테이블 만들어서 실시간 변경사항은 따로 로깅하면서 임시 테이블을 만들어서 기존 테이블을 토대로 reconstruction 하는 방식으로 옮긴다.
	- 기존 테이블 reconstruction 끝나면 임시 로그 테이블에서 변경사항 끌고 와서 실시간으로 맞춘다.
	- 다 되면 Exclusive lock 잠깐 걸고 원본 테이블과 임시 테이블을 바꿔치기한다.

# 4. Visibility Map
- 무거운 VACUUM FULL 대신 일반 VACUUM이 주기적으로 동작한다.
- PostgreSQL의 Visibility Map은 테이블의 각 힙 페이지의 모든 튜플이 가시적인지 추적하는 메타데이터이다.
- 각 힙 페이지마다 2개의 비트로 상태를 표현한다.
	- `all_visible`
		- 페이지에 Dead Tuple이 없는 상태로, 모든 튜플이 가시적(visible)이다.
	- `all_frozen`
		- `all_visible` 조건을 만족하는 동시에 모든 튜플이 동결된(frozen) 상태이다.
- PostgreSQL은 이 두 가지 flag에 맞추어, 두 가지 VACUUM 모드를 사용한다.
	- **Lazy Mode (일반 VACUUM)**: `all_visible=0`인 페이지만 처리하여 Dead Tuple 제거한다.
	- **Eager Mode (VACUUM Freeze)**: `all_frozen=0`인 페이지를 처리하여 튜플을 동결(Freezing)한다.
- 만약 페이지에 더이상 살아있는 튜플이 단 하나도 없다면 그제서야 인덱스의 Free Space Map에 페이지를 반환한다.

# 5. 튜플 Freezing
- 앞서 설명한 Eager Mode에서 튜플을 동결(Freezing)하는 이유는, Transaction ID Wraparound 문제를 방지하는 작업이다.
