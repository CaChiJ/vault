---
publish: true
modified: 2026-03-25T16:41:32+09:00
cssclasses: ""
---

# 1. NAND Flash
## 1.1. Organization
![[Pasted image 20260325195639.png|434]]
- NAND Flash는 Block/Page/Sector의 세 가지 계층(단위)로 나뉜다.
	- Programming(쓰기) 연산은 Page 단위로 일어나며
	- Erase(삭제) 연산은 Block 단위로 일어난다.

![[Pasted image 20260325195828.png|429]]
- 또한, ECC와 FTL Metadata 저장을 위한 Spare Area가 존재한다. (사용자가 직접 조작할 수 없다.)

![[Pasted image 20260325200011.png|431]]
- 각각의 Block들은 하나의 Plane에 저장되며, Plane > Die > Chip > Package 순으로 묶인다.
## 1.2. Basic operations
- NAND Flash에서 지원하는 대표적인 세 가지 연산은 다음과 같다.

| 연산    | 인자                        | 일반적인 소요 시간 |
| ----- | ------------------------- | ---------- |
| Read  | (chip #, block #, page #) | 25us       |
| Write | (chip #, block #, page #) | 200us      |
| Erase | (chip #, block #)         | 1,500us    |

## 1.3. Modifying data in NAND Flash
- NAND Flash의 중요한 특성 중 하나는 Erase가 Block 단위로 수행된다는 점이다.
- 만약 특정 페이지의 값을 수정하려면 다음과 같은 비효율적인 과정을 거쳐야 한다.
	1. 해당 페이지가 속한 블록을 임시 공간에 복사한 뒤
	2. 블록 전체를 Erase하고
	3. 수정하려 했던 Page를 Write하고
	4. 임시 공간에 저장했던 페이지들을 Write해야 한다.

- 이를 개선하려면 논리적 주소(Sector #)와 물리적 주소(Page #)를 분리하고, Mapping Table을 기반으로 Address Translation하는 방법을 생각해 볼 수 있다. (FTL)
## 1.4. Advanced Operation

#### ◼️ Copy back
- 하나의 칩 안에 있는 Block들은 Page Register를 공유한다.
- 때문에 Copy 대상(source)과 목적지(destination)이 하나의 Chip 내에 위치한다면, Page Register를 이용해 System BUS나 DRAM buffer를 거치지 않고 복사할 수 있다.

![[Pasted image 20260325212010.png|429]]

#### ◼️ Cache read/program
- Cache register를 이용해 하나의 chip 안에서 Read/Write Latency를 줄일 수 있다.

![[Pasted image 20260325212218.png|432]]

- 이 밖에도 Multi-plane operations, Interleaving 등 기법이 존재한다.

## 1.5. Restrictions in Page Programing
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

## 1.6. Other issue
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

---
# 2.H/W and S/W Architectures

## 2.1. Components of SSD
#### ◼️ Components
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774709532728.webp|564]]
- SSD는 NAND Flash 뿐만 아니라, 다양한 요소로 구성돼 있다.
1. NAND
	- 데이터를 실질적으로 저장하는 공간
2. Host interface
	- 컴퓨터(Host)와 SSD가 데이터를 주고 받는 인터페이스를 제공한다.
	- e.g., SATA, PCIe
3. DRAM
	- NAND Flash의 속도는 Memory에 비해 매우 느리다.
	- 이 때문에 Read/Write의 병목을 절감하기 위해 버퍼로서 사용한다.
	- 그 밖에도 명령어 큐 또는 각종 메타데이터를 올려두고 사용한다.
4. Controller
	- 내부에 Processor, SRAM, ROM 등을 갖춘, 하나의 작은 컴퓨터라고 볼 수 있다.
	- 기본적으로는 호스트와 낸드 플래시 사이에 데이터를 중계하기 위해 회로를 제어하는 역할을 맡는다.
	- 더 나아가, Address Translation, GC, Wear Leveling, ECC, Bad block management 등 다양한 작업을 수행한다.

#### ◼️ Inside of Controller
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774710398600.webp|417]]
- 위 그림은 얼핏 보면 하나의 범용 컴퓨터 구조로 보인다.
- 사실 위 그림은 컨트롤러 내부 구조와, 컨트롤러가 제어하는 SSD 구성 요소들을 표시한 그림이다.
- 컨트롤러는 CPU, SRAM, ROM을 갖추고 있으며, System BUS를 통해 NAND/Host Interface/DRAM을 제어한다.

## 2.2. Parallel Architecture
#### ◼️ Parallel architecture 
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774710771648.webp|568]]
- NAND Flash는 여전히 Memory보다 느리다.
- 여러 Chip에 병렬적으로 데이터를 저장하는 방식으로 성능을 개선할 수 있다.
- 이때 Flash Controller에서 나와 데이터를 주고 받는 BUS를 Channel이라 부르고, BUS와 Chip이 연결되는 부분을 Way라 부른다.

#### ◼️ Interleaved Operations
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774711082215.webp|578]]
- 크게 (좌)Way-Level Interleaving과 (우)Channel-Level Interleaving으로 나누어 볼 수 있다.
	- Way-Level Interleaving에서는 하나의 Channel을 나누어 쓰므로, 다른 Way의 `D`ata Transfer가 완료될 때까지 대기해야 한다.
	- Channel-Level Interleaving에서는 각자가 Channel을 독립적으로 사용하므로, 다른 병렬 작업을 신경 쓰지 않고 처리할 수 있다.
- Way-Level Interleaving에서도 `Program` 작업은 거의 동시에 수행할 수 있다.
	→ `D`ata Transfer를 대기하는 오버헤드를 감내할 수 있다면, 굳이 채널과 Controller를 늘리지 않아도 되는 Way-Level Interleaving도 충분히 좋다.


## 2.3. Increasing Throughput Using Queues
#### ◼️ Queues in SSD
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774711643329.webp|580]]
###### Sata Command Queue
- NAND Flash를 조작하는 속도는 Host에 비해 훨씬 느리다.
- 때문에 Host로부터 전달 받은 Read/Write 명령은 우선 SSD의 DRAM에 위치한 SATA Command Queue에 저장한 뒤, Controller가 하나씩 처리한다.
	- Q. 갑작스러운 정전 상황에서, Host는 분명 데이터를 썼는데 실제로는 DRAM의 큐에 있어서 데이터가 증발하는 문제(Data Corruption)가 생기지 않나?
	- A. 맞다. DRAM의 데이터는 사라진다. 이를 해결하기 위해 SSD는 커패시터를 내장하여 정전상황에서 커패시터 전력을 이용해 DRAM의 데이터를 NAND Flash에 Write한다. 이를 PLP(Power Loos Protection)라고 부른다.
###### Flash Translation Layer
- Controller는 Queue에 들어온 Read/Write 명령을 처리할 때, 명령의 주소를 FTL(Flash Translation Layer)를 통해 실제 NAND Flash의 물리적 주소로 매핑한다.
	- SSD는 In-Place Update가 불가능하기 때문에, FTL 레이어에서 이를 감추는 역할을 수행한다. (새로운 물리적 공간에서 Write한뒤 논리적 주소 매핑 정보를 변경)
###### Flash Command Queue
- FTL을 거치는 과정에서 각 명령들은 실제 NAND Flash의 물리적 주소를 가리키게 된다.
- 각 Channel 마다 큐를 할당하고, (병렬 처리를 위해) 각 채널의 큐에 골고루 나누어 작업들을 쌓는다.

#### ◼️ FTL: Write
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774718074076.webp|576]]
- Host가 수십 KB의 데이터를 Write할 때, 이를 연속된 공간에 쓰게 되면 하나의 Channel만 사용하므로 느리다.
- FTL은 데이터를 4KB 단위의 페이지들로 쪼갠 후, 여러 Channel의 큐로 나누어 보낸다.
- 각 Channel은 독립적으로 페이지를 Write하므로 지연시간이 낮아진다.

#### ◼️ FTL: Read
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774718444600.webp|594|572x334]]
- 앞서 FTL은 연속된 논리적 공간을 여러 개의 조각난 물리적 공간으로 나누어 Write함으로써, 병렬적으로 Channel들을 활용했다.
- 이렇게 여러 채널에 나누어 Write를 하게 되면 Read할 때에도 레이턴시의 개선을 기대할 수 있다.
- Read 연산 또한 FTL에 의해 여러 개의 물리적 페이지 주소로 변환되며, 이는 앞서 Write할 때 쪼개놓은대로 여러 Channel에 나뉘어 들어간다.

#### ◼️ NCQ(Native Command Queue)
- 앞서 Host가 전달한 Read/Write 명령은 SATA Command Queue에 저장된다고 말했다.
- 하지만 그보다 앞에, Host의 입력을 받는 NCQ가 위치할 수 있다.

###### Q. 그렇다면 앞서 본 SATA Command Queue와 왜 별개로 NCQ라는 공간이 존재하는 걸까? 걍 HOST가 SCQ에다가 쌓아두고 컨트롤러가 알아서 처리하면 안되나?
- 된다.
- 그럼에도 **NCQ가 존재하는 이유**는 (1)Host의 명령들을 받는 버퍼 역할을 수행하고 (2)들어온 명령들을 SATA command queue로 옮길 때 단순 FIFO보다 정교한 로직(Reordering)을 통해 성능을 개선하기 위함이다.
- 대표적으로 다음 두 가지 목적을 위해 명령 순서를 재배열한다.

1. HDD를 쓰던 시대에 Data Seek은 굉장히 큰 병목이었다.
   → 비슷한 위치의 명령들을 묶어서 처리한다.
2. Write보다 Read의 Latency 절감이 더 중요하다. Write는 걍 SSD의 DRAM에 넣고 완료했다고 응답하면 된다. 근데 Read 명령은 진짜 NAND Flash까지 조회한 후 응답해야 한다.
	→ Read 명령을 Write 명령보다 앞서 배치한다.

## 2.4. RMW (Read-Modify-Write)
- NAND Flash는 값의 수정이 불가능하다.
- 때문에 페이지의 일부를 수정하려면 Read-Modify-Write 과정을 거쳐야 한다.

| Read                                                                              | Modify                                                                            | Write                                                                             |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774767201969.webp]] | ![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774767210423.webp]] | ![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774767222715.webp]] |
- 그러나 이러한 RMW는 비효율적인데, 아주 작은 데이터 하나만 바꾸려고 해도 Page에 대한 Read와 Write가 한 번씩 일어나기 때문이다.

## 2.5. Firmware Architecture of the Flash Storages
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774768023764.webp|165]]
- Flash Storage의 Controller는 S/W 아키텍처 상에서 OS와 Flash Memory Chip 사이에 위치해 있다.
- FTL은 OS가 이해하는 LBA 단위의 명령을 NAND Flash에 적합한 연산으로 변환해주는 역할을 수행한다.
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774768147812.webp|334]]
- 위 그림은 Controller 내부의 Firmware에 대한 전체적인 그림이다.
- 하나씩 뜯어서 살펴보자.

#### ◼️ Main Loop
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774768290448.webp|315]]
- Main Loop는 이름에서 알 수 있듯이, 반복적으로 Queue의 명령어(cmd)를 하나씩 꺼내 처리하는 역할을 수행한다.
```c
while(1) {
	if (READ command exist) ftl_read();
	else if (WRITE command exist) ftl_write();
	else ftl_idle_time_job();
}
```
#### ◼️ Mapping (Address Translation)
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774768605374.webp|218]]
- Mapping 로직은 Host가 이해하는 논리적 주소(**L**ogical **P**age **N**umber)를 실제 물리적 주소(**P**hysical **P**age **N**umber)로 변환한다.
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774768715725.webp|214]]
- 이를 위해 Mapping Table(LPN to PPN)을 구성하고 관리한다.
- 앞서 RMW에서 데이터를 수정할 땐 빈 공간에 데이터를 Write하고 새로운 페이지를 가리키도록 한다고 했는데, 이 Mapping Table이 그 역할을 수행한다.
![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774768696503.webp|361]]
- 꼭 RMW가 아니더라도, LPN-PPN Mapping은
	1. Storage를 추상화하고
	2. Bad Block 문제를 감추기 위해 꼭 필요하다.

###### Categories of Mapping Schemes 
- 매핑 기법은 그 단위에 따라 3가지로 나눌 수 있다.

| Block Mapping                                                                     | Pager Mapping                                                                     | Hybrid Mapping                                                                    |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774769053291.webp]] | ![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774769058381.webp]] | ![[Kafka와 ZNS SSD 호환을 위한 리눅스 커널 Block Layer (1) - NAND Flash-1774769066610.webp]] |
| - Logical Block Number를                                                           |                                                                                   |                                                                                   |
