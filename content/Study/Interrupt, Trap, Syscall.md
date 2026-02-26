---
publish: true
title: Interrupt, Trap, Syscall
modified: 2026-02-19
cssclasses: ""
---

# 1. 분류 체계
```text
Interrupt
├── Hardware Interrupt (타이머, 키보드 등 물리적 장치)
└── Software Interrupt (Exception)
    ├── Trap (자발적: syscall 명령어, breakpoint 등)
    └── Fault (비자발적: divide-by-zero, page fault 등)
```

- **Interrupt**는 하드웨어 신호나 소프트웨어 이벤트를 계기로 CPU가 현재 흐름을 중단하고, 인터럽트 디스크립터(IDT) 기반 핸들러로 제어를 넘기는 메커니즘을 뜻한다.
- **Exception**은 명령 실행 중 CPU가 동기적으로 감지한 예외를 뜻한다.
	- **Trap**은 Exception 중에서도, 프로그램이 의도적으로 발생시키는 경우(syscall, breakpoint)를 뜻한다.
	- **Fault**는 의도치 않은 Exception(e.g., divide-by-zero, page fault)을 뜻한다.
- **Syscall**은 사용자 모드에서 커널 기능을 호출하기 위한 인터페이스 자체를 뜻한다. (`int 0x80`은 과거 x86 Linux의 호출 방식 중 하나)

# 2. Trap의 동작 원리
- Trap은 "지금 커널에게 제어를 넘겨 처리해 달라"는 성격의 동기식 예외로 볼 수 있다.
- x86 Linux 기준으로는 과거의 `int 0x80` 방식과, 현대의 `syscall` 명령 방식이 대표적이다.
- `int 0x80`에서 `0x80`은 시스템 콜 번호가 아니라 인터럽트 벡터 번호다.

#### ◼️ 실행 흐름
- x86 보호 모드 기준으로 OS는 IDT(Interrupt Descriptor Table)를 세팅한다.
- 실제 실행 흐름:
	1. `%eax` 레지스터에 시스템 콜 번호를 저장한다.
	2. `%ebx`, `%ecx`, `%edx` 등 레지스터에 시스템 콜 인자를 저장한다.
	3. `int 0x80`을 실행하여 소프트웨어 인터럽트를 일으킨다.
	4. CPU는 커널 모드로 전환되고, IDT의 `0x80` 엔트리 핸들러로 점프한다.
	5. 커널 핸들러가 `%eax`의 시스템 콜 번호를 읽어 시스템 콜 테이블에서 실제 커널 함수를 호출한다.

# 3. 현대의 Syscall
- 과거 x86 Linux의 `int 0x80` 경로는 IDT의 `0x80` 엔트리 핸들러로 진입한 뒤, 레지스터의 syscall 번호/인자를 해석해 시스템 콜 테이블로 분기했다.
- 현대 x86-64 Linux는 주로 `syscall/sysret` 경로를 사용한다. 이 경로는 시스템 콜 진입/복귀를 CPU가 직접 지원해 `int 0x80` 대비 오버헤드가 더 작다.
- `int 0x80` 경로는 호환성 목적으로 남아 있지만, 성능 관점에서 주 경로는 아니다.
