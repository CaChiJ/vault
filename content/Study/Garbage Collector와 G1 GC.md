---
publish: true
title: Garbage Collector와 G1 GC
modified: 2025-09-22
cssclasses: ""
---

# 1. Young/Old 영역 분리
- 가비지 컬렉터는 두 가지 가설(전제) 하에 만들어져 동작한다.
	1. 대부분의 객체는 금방 접근 불가능 상태(unreachable)가 된다.
	2. 오래된 객체에서 젊은 객체로의 참조는 아주 적게 존재한다.
- HotSpot VM에서는 이 전제를 이용해 다음 2가지 영역으로 물리적 공간을 나눈다.
![[Pasted image 20250922130239.png]]

#### ◼️ Young 영역 (Young Generation 영역)
- 새롭게 생성한 객체의 대부분이 위치함.
- 대부분의 객체가 금방 접근 불가능 상태가 되기 때문에 매우 많은 객체가 Young 영역에 생성되었다가 사라진다.
- 이 영역에서 객체가 사라질때 Minor GC가 발생한다고 말한다.

#### ◼️ Old 영역 (Old Generation 영역)
- 접근 불가능 상태로 되지 않아 Young 영역에서 살아남은 객체가 여기로 복사됨.
- 대부분 Young 영역보다 크게 할당하며, Young 영역보다 GC는 적게 발생한다.
- 이 영역에서 객체가 사라질 때 Major GC(혹은 Full GC)가 발생한다고 말한다.

#### ◼️ Old → Young 참조
- Old 영역에는 512바이트의 chunk로 이루어진 카드 테이블이 존재한다.
- 카드 테이블은 Write barrier를 사용해 관리한다. 약간의 오버헤드가 발생하지만 전반적인 GC 시간은 줄어든다.
- Young 영역의 GC를 실행할 때에는 Old 영역에 있는 모든 객체의 참조를 확인하지 않고, 이 카드 테이블만 뒤져서 GC 대상인지 식별한다.
![[Pasted image 20250922130556.png]]

# 2. Young 영역 흐름
- Young 영역은 `Eden` 과 두 개의 `Survivor` 영역으로 나뉜다.
1. 새로 생성한 대부분의 객체는 Eden 영역에 위치한다.
2. Eden 영역에서 GC가 한 번 발생한 후 살아남은 객체는 Survivor 영역 중 하나로 이동된다.
3. 시간이 흐르면 Eden의 GC에서 살아남은 객체들로 Survivor 영역이 가득 차게 되는데, 이때 가득찬 Survivor 영역에 대해 GC를 수행하고 살아남은 객체들을 다른 Survivor 영역으로 옮긴다.
4. 이 과정 속에서 계속해서 살아남은 객체를 Old 영역으로 옮긴다.
![[Pasted image 20250922135922.png]]

# 3. G1 GC
- G1 GC는 JAVA 7부터 추가되었으며 JAVA 9에서 기본 GC로 채택되었고, JAVA 14에서 기존 기본 GC 였던 CMS GC는 완전 제거되었다.
- G1은 힙을 고정된 크기의 Region으로 나누고, 각 Region을 상황에 따라 Eden/Survivor/Old로 역할 부여한다.
- 즉, 과거 CMS처럼 영역 전체를 크게 쓸기보다 "회수 이득이 큰 Region부터" 선택적으로 수거하는 구조다.
- 큰 객체(Humongous Object)는 일반 Region 여러 개를 연속 점유하는 형태로 관리되어, 별도 취급된다.
- G1의 기본 흐름은 Young GC + Concurrent Marking + Mixed GC로 이어진다.
	- Young GC: Eden/Survivor 중심 회수
	- Concurrent Marking: Old 영역 생존 객체를 애플리케이션과 병행 마킹
	- Mixed GC: Young 영역과 함께 회수 가치가 높은 일부 Old Region을 같이 수거
- 또한 G1은 목표 pause time(`-XX:MaxGCPauseMillis`)을 기준으로, 이번 사이클에서 어떤 Region을 얼마나 회수할지 예측해 수거량을 조정한다.
- 이 예측이 항상 완벽하진 않지만, "긴 정지 한 번"보다 "짧은 정지 여러 번"으로 지연을 제어하기 쉽다는 장점이 있다.

# 4. GC가 있어도 메모리 릭이 발생하는 경우
- JVM이 알아서 GC 통해 Heap을 관리하므로 Memory Leak이 안 일어난다고 생각하면 오산이다.
- 결국 GC의 기본 원리 자체는 Pointing이 있는지 없는지 확인하는 것이기에, 개발자 자신도 모르는 Pointing이 Static 영역 등에 남아 있으면 해제가 안된다.
- 대표적인 사례로는 다음과 같다.
	1. Static으로 선언된 List나 Map 안에 객체를 담아 두는 경우
	2. 해제하지 않은 리스너/콜백
	3. 내부 클래스는 항상 자신을 생성한 외부 클래스의 참조를 가짐
