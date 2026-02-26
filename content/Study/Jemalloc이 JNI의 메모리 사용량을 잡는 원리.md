---
publish: true
title: Jemalloc이 JNI의 메모리 사용량을 잡는 원리
modified: 2026-02-13
cssclasses: ""
---

# 1. JVM 모니터링과 Off-Heap 메모리
- JVM 모니터링에서 메모리 사용량이 정상인데 서버가 OOM으로 죽는다면?
- Off-heap 메모리의 존재를 의심해봐야 한다. JNI나 네이티브 코드가 `malloc`으로 직접 메모리를 할당하는 경우, 이 공간은 JVM GC가 추적할 수 없기 때문이다.
- 이럴 때 Jemalloc을 활용해 메모리 할당 가시성을 확보할 수 있다.

# 2. Jemalloc이 malloc을 가로채는 원리
- `LD_PRELOAD=/path/to/libjemalloc.so` 환경변수를 설정하고 실행하면 Jemalloc이 등록된다.
- Linux의 동적 링커(`ld-linux`)는 프로세스를 시작할 때 심볼 해석 순서를 결정하는데, 표준 라이브러리인 `libc.so`보다 `LD_PRELOAD`에 명시된 `libjemalloc.so`를 먼저 로드하게 된다. (왜 libjemalloc의 malloc이 libc의 malloc보다 먼저 잡히는가의 핵심이다)
	- 이 `libjemalloc.so` 에는 malloc과 인터페이스가 동일하지만, 정교하게 커스텀된 구현체가 들어있다.
- JVM이나 JNI가 `malloc()` 함수를 찾을 때, `libc.so` 보다 먼저 로드된 `libjemalloc.so` 의 `malloc()` 을 먼저 찾아 호출하게 된다.
	- 다시 말하면, `malloc()`을 제외한 다른 시스템 콜 등은 여전히 `libc.so`가 처리한다.

# 3. 그렇다면 Java Heap 공간도 잡히나요?
- 아니다.
- `new`로 생성해 객체가 저장되는 Java Heap 영역은 `malloc`으로 할당되지 않는다.
- JVM이 시작할 때(혹은 힙이 확장될 때), JVM은 OS에게 `mmap()` 을 호출하여 힙 공간을 확보한다.
- 그리고 JVM은 이렇게 확보한 힙 공간을 자기 나름대로 알아서 쪼개서 쓴다.
	- 때문에 JVM의 `new` 를 통한 객체 생성은 OS에게 새로운 공간을 요청하는 게 아니고 단순히 내부적으로 관리하는 힙 영역의 일부를 주는 거기 때문에, C의 `malloc` 보다 빠를 수 있다.
- 물론 Java Heap 외에 스레드 스택이나 메타스페이스, 코드 캐시, GC 데이터 구조, Direct Buffer 등은 네이티브 메모리(Non-Heap) 공간에 잡힌다. → 이들은 `mmap`/`malloc` 등 네이티브 할당 경로를 사용한다.
	- 단, Spring Actuator가 보여주는 Non-Heap 공간은 위에서 언급한 JVM이 직접 할당하는 공간만 뜻한다. 그 밖에 JNI 등으로 직접 malloc 요청하는 것들은 안 잡힌다.

# 4. 진단 방법
- 핵심은 "프로세스 시작 시 jemalloc을 preload"하고, "프로파일 출력 옵션을 켠 뒤", "jeprof로 집계"하는 3단계다.
- 프로파일 확인 예시:
```bash
jeprof --show_bytes --text $(which java) /var/log/app/jeprof*.heap | head -50
```
- 이렇게 보면 "어떤 네이티브 함수 경로에서 메모리를 많이 잡는지"를 바이트 기준으로 확인할 수 있다.
- 실제로 내 로그에서는 Total 약 521MB 중 특정 JNI 경로가 94% 이상을 차지하는 패턴을 확인했고, JVM Heap 지표만으로는 보이지 않던 원인을 추적할 수 있었다.
