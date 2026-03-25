---
publish: true
modified: 2026-03-25T16:41:32+09:00
cssclasses: ""
---

## 1. Organization
![[Pasted image 20260325195639.png|434]]
- NAND Flash는 Block/Page/Sector의 세 가지 계층(단위)로 나뉜다.
	- Programming(쓰기) 연산은 Page 단위로 일어나며
	- Erase(삭제) 연산은 Block 단위로 일어난다.

![[Pasted image 20260325195828.png|429]]
- 또한, ECC와 FTL Metadata 저장을 위한 Spare Area가 존재한다. (사용자가 직접 조작할 수 없다.)

![[Pasted image 20260325200011.png|431]]
- 각각의 Block들은 하나의 Plane에 저장되며, Plane > Die > Chip > Package 순으로 묶인다.
## 2. Basic operations
- NAND Flash에서 지원하는 대표적인 세 가지 연산은 다음과 같다.

| 연산    | 인자                        | 일반적인 소요 시간 |
| ----- | ------------------------- | ---------- |
| Read  | (chip #, block #, page #) | 25us       |
| Write | (chip #, block #, page #) | 200us      |
| Erase | (chip #, block #)         | 1,500us    |

## 3. Modifying data in NAND Flash
- NAND Flash의 중요한 특성 중 하나는 Erase가 Block 단위로 수행된다는 점이다.
- 만약 특정 페이지의 값을 수정하려면 다음과 같은 비효율적인 과정을 거쳐야 한다.
	1. 해당 페이지가 속한 블록을 임시 공간에 복사한 뒤
	2. 블록 전체를 Erase하고
	3. 수정하려 했던 Page를 Write하고
	4. 임시 공간에 저장했던 페이지들을 Write해야 한다.

- 이를 개선하려면 논리적 주소(Sector #)와 물리적 주소(Page #)를 분리하고, Mapping Table을 기반으로 Address Translation하는 방법을 생각해 볼 수 있다. (FTL)
## 4. Advanced Operation

#### ◼️ Copy back
- 하나의 칩 안에 있는 Block들은 Page Register를 공유한다.
- 때문에 Copy 대상(source)과 목적지(destination)이 하나의 Chip 내에 위치한다면, Page Register를 이용해 System BUS나 DRAM buffer를 거치지 않고 복사할 수 있다.

![[Pasted image 20260325212010.png|429]]

#### ◼️ Cache read/program
- Cache register를 이용해 하나의 chip 안에서 Read/Write Latency를 줄일 수 있다.
![[Pasted image 20260325212218.png|432]]

- 이 밖에도 Multi-plane operations, Interleaving 등 기법이 존재한다.

## 5. Restrictions in Page Programing
#### ◼️ NOP (Number Of Programming)
- 하나의 페이지에 대해, 얼마나 많이 나누어 Write할 수 있는지 의미하는 값이다.
- NAND Flash는 값을 기록하기 위해 높은 전압을 가하는 과정에서 셀 간의 간섭이 발생할 수 있다.
- 때문에 여러 번 값을 나누어 쓰는 과정에서 기존 값들이 간섭 당해 바뀔 가능성이 있다.
- SLC에서는 1개의 셀이 0/1 두 가지 값만 표현하므로, 간섭에 의한 영향이 적어 4~8의 NOP를 가질 수 있다.
- 그러나 MLC부터는 1개의 셀이 00/01/10/11 4가지 값을 표현하므로, 나중에 가해진 전압으로 인해 데이터 오염이 발생할 수 있다. → NOP가 1회로 제한된다.
#### ◼️ Writing sequence in a block
- 하나의 Block 안에 있는 Page들은 반드시 한 방향으로 순서대로(Sequentially) Write되어야 한다.
- 이는 Random하게 Write할 경우 일부 셀들은 양쪽으로 간섭당한다. → 오염 가능성이 높아진다.
- 반면 Sequential하게 Write할 경우 각 페이지가 최대 한 번씩만 간섭당한다. → 오염 가능성이 비교적 낮다.
![[Pasted image 20260325213246.png|647]]

## 6. Other issue
#### ◼️ Wear-out
- Nand Flash Block에는 P/E(Programming/Erase) 사이클의 한계가 존재한다.
	- SLC → 100K
	- MLC → 10K
	- TLC → <5K
- 정해진 P/E Cycle을 넘어서면 Erase 연산의 안정성을 보장할 수 없다.

#### ◼️ Lack of Data Integrity
- Bad Block
- Bit Flipping
- Leakage
- Read Disturbance