---
publish: true
title: 경량 Obsidian MCP 검색 기능 만들기(4) - 문서 Embedding을 통해 NDCG@k를 개선해보자
modified: 2026-06-02T11:16:12.253+09:00
cssclasses: ""
---

# 0. 배경
- [[Project: MCP-Obsidian/경량 Obsidian MCP 검색 기능 만들기(3) - BM25를 이용해 NDCG@k를 개선해보자\|지난 글]]에서는 BM25를 이용해 ndcg@5를 0.353까지 개선했다.
- 하지만 BM25는 여전히 텍스트 매칭 방식이므로 오타나 띄어쓰기 등에 취약하다.
- 때문에 검색 정확도를 더 개선하기 위해서는 의미론적(Semantic) 맥락을 고려할 수 있어야 하고, 이때 텍스트 임베딩이 필요하다.
	- 오픈소스 커뮤니티 내에서도 Semantic Search에 대한 논의가 제안되어 왔다. (https://github.com/bitbonsai/mcpvault/issues/28)

# 1. 임베딩 모델 선정
- [jina-embedding-v5-text-nano-retrieval-GGUF](jinaai/jina-embeddings-v5-text-nano-retrieval-GGUF) 모델을 사용했는데, 그 이유는 다음과 같다.
	1. 로컬 머신에서 임베딩이 수행되어야 하므로, GB 단위의 메모리를 할당하기 곤란하다. (가능하다면 수백 MB 내외로 처리하고 싶다.)
	2. [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard)에서 Active Parameter가 0.5b 이하인 Multilingual Retrieval 모델 중 가장 좋은 성능을 보인다.
![[경량 Obsidian MCP 검색 기능 만들기(4) - -1780478382387.webp]]
# 2. 모델 구동하기
- 로컬 머신의 Node 런타임에서 GGUF 양자화 모델을 구동하기 위해 [node-llama-cpp](https://www.npmjs.com/package/node-llama-cpp) 라이브러리를 사용했다.
```js
// init
const llama = await getLlama();
const model = await llama.loadModel({ modelPath });
this.context = await model.createEmbeddingContext({
	contextSize: this.options.contextSize, // 1024
});

// embed
const embedding = await this.context.getEmbeddingFor(formattedText);
```
- node-llama-cpp 라이브러리는 Node에서 llama-cpp의 함수를 호출할 수 있게 Wrapping하고 있고, llama-cpp는 ggml 라이브러리를 이용해 GGUF 모델을 이용해 추론을 수행한다.

# 3. 메모리 사용량 측정하기
- 임베딩 과정에서 얼마나 많은 메모리를 사용하는지 측정 및 기록할 방법이 필요했다.
- 하지만 벤치마크 프로세스 내에는 임베딩/검색 작업 뿐만 아니라 성능 메트릭 수집 관련 워크로드도 있기 때문에, 임베딩 및 검색에 사용되는 메모리만 독립적으로 수집할 방법이 필요하다.
- 이를 위해 새로운 자식 프로세스를 fork한 뒤 해당 프로세스에 대한 PID로 프로세스의 메모리 사용량을 프로파일링함으로써 현재 임베딩 프로세스가 얼마나 많은 메모리를 사용하고 있는지 측정하는 벤치마크 코드를 구성하였다.
```ts
// 임베딩 작업을 수행하는 자식 프로세스를 생성한다.
const child = fork(WORKER_PATH, [JSON.stringify({ ...config, runOptions })], ...);

// 주기적으로 자식 프로세스의 메모리 사용량을 확인 및 기록한다.
const pollMemoryUsage = setInterval(async () => {
	if (!activePhase) { return; }
	
	try {
		const stats = await pidusage(child.pid!);
		const mb = stats.memory / 1024 / 1024;
		phasePeaks[activePhase] = Math.max(phasePeaks[activePhase] ?? 0, mb);
	} catch { ... }
}, 200);
```

- 위 방법을 통해, 다음과 같은 결과를 얻을 수 있었다. (NF-Corpus를 토대로 구성한 3,633개 문서와 192개 쿼리로 벤치마킹)

| 모델                                |    NDCG@5 | Init 소요시간(s) | Avg Latency(ms) | P95 Latency(ms) | Init Peak(MB) | Search Peak(MB) |
| --------------------------------- | --------: | -----------: | --------------: | --------------: | ------------: | --------------: |
| jina-v5-text-nano GGUF IQ1_S      |     0.183 |        160.3 |            14.7 |            17.3 |         902.9 |           919.8 |
| jina-v5-text-nano GGUF IQ1_M      |     0.222 |        157.5 |            15.5 |            20.3 |         930.7 |           932.6 |
| jina-v5-text-nano GGUF IQ2_XXS    |     0.297 |        158.3 |            14.5 |            18.0 |         932.0 |           931.5 |
| jina-v5-text-nano GGUF Q2_K       |     0.342 |        159.3 |            14.6 |            16.7 |        1075.7 |          1038.3 |
| jina-v5-text-nano GGUF IQ2_M      |     0.376 |        161.1 |            15.1 |            17.5 |         884.5 |           899.7 |
| **jina-v5-text-nano GGUF Q3_K_M** | **0.417** |    **159.6** |        **15.5** |        **20.5** |    **1135.3** |      **1133.7** |
| **jina-v5-text-nano GGUF IQ4_XS** | **0.422** |    **158.8** |        **14.8** |        **17.1** |     **873.2** |       **874.7** |
| **jina-v5-text-nano GGUF IQ4_NL** | **0.423** |    **152.7** |        **13.2** |        **18.2** |    **1022.6** |      **1051.6** |
| **jina-v5-text-nano GGUF Q4_K_M** | **0.423** |    **159.7** |        **13.0** |        **15.4** |     **931.7** |       **943.9** |
- 정확도 측면에서는, 모델의 크기가 커짐에 따라 NDCG@5도 비례하여 향상되는 상관관계를 확인할 수 있었지만 `Q3_K_M` 모델부터는 그 상관관계가 거의 없다시피 함을 알 수 있었다.
- 메모리 측면에서는, 실험 이전엔 "모델 크기만큼 메모리를 사용할테니 기껏 해봐야 200MB 정도 사용하지 않을까?" 생각했다.
	- 하지만 실제로는 모델 가중치 뿐만 아니라, 추론 과정에서도 행렬이 생성되기 때문에 1GB 이상 메모리를 사용한다. → **이를 줄일 방법을 고민해 봐야 한다.**
# 4. Context Size 조정하기
#### ◼️ Problem: KV 행렬
- jina-embeddings-v5-text-nano 모델은 트랜스포머 기반의 Encoder 모델이다.
- 때문에 추론 과정에서 메모리 상에 KV 캐시를 올려두고 사용한다.
- 기본 Context Size는 8192로 설정되어 있기 때문에, 임베딩을 수행할 때마다 다음과 같이 KV 행렬이 288MB를 점유함을 예상할 수 있다.
	- jina-embeddings-v5-text-nano 모델 구성
		- Hidden Size: 768
		- Hidden Layer: 12
		- Head Dimension: 64 (→ Head Count = 768 / 64 = 12)
	- KV 행렬 크기
		- $(히든레이어 개수)12개 * (토큰별 캐시 벡터 길이)768 * (Float16)2 * (Context 크기)8192 * (Key, Value 각각)2 = 288MB$

#### ◼️ Idea: Context Size 제한하기
- 그렇다면 최대 Context Size를 제한하면 어떨까?
- 산술적으로는 Context Size를 512 Token으로 제한했을 때, 아래와 같이 250MB 이상의 메모리 공간이 절약되리라 기대할 수 있다.

| Context Size (Token) | 행렬 최대 크기 (MB) |
| -------------------- | ------------- |
| 8192                 | 288           |
| 4096                 | 144           |
| 2048                 | 72            |
| 1024                 | 36            |
| 512                  | 18            |
#### ◼️ Implementation: 
- 문서를 context size 단위로 잘라 임베딩하였고, 앞 뒤 구간이 겹치는 overlap 구간은 10%로 설정했다.
```ts
const overlap = Math.floor(maxTokens * 0.1);
const chunks = [];

for (let start = 0; start < tokens.length; start += maxTokens - overlap) {
	const chunkTokens = tokens.slice(start, start + maxTokens);
	const embedding = await this.context.getEmbeddingFor(chunkTokens);
	const vec = new Float32Array(embedding.vector);
	this._dimensions = vec.length;
	chunks.push(vec);
}

return chunks;
```

#### ◼️ Result
- `Q3_K_M` 양자화 버전을 기준으로 벤치마크를 수행하였고, 아래와 같은 결과를 얻을 수 있었다. (데이터셋은 동일하게 NF-Corpus 기반으로 구성한 3,633개 문서와 192개 쿼리를 사용했다)

| Context Size | NDCG@5 | Init (s) | Avg Latency (ms) | P95(ms) | Init Peak MEM (MB) | Search Peak MEM (MB) |
| ------------ | ------ | -------: | ---------------: | ------- | ------------------ | -------------------- |
| 512          | 0.416  |    284.5 |             23.5 | 20.2    | 752.8              | 648.6                |
| 1024         | 0.415  |    267.8 |             21.3 | 21.9    | 793.9              | 792.0                |
| 2048         | 0.415  |    298.1 |             21.9 | 22.1    | 923.7              | 878.3                |
| 4096         | 0.417  |    370.2 |             20.8 | 20.6    | 918.0              | 893.3                |
| 8192         | 0.417  |    452.6 |             26.8 | 30.2    | 869.2              | 865.4                |

- Context Size를 512로 설정했을 때, Search 작업에 사용되는 Peak 메모리 사용량이 216.8MB가 감소함을 확인할 수 있었다.
- Init Peak 메모리 사용량이 산술적으로 기대한만큼 줄어들지 않은 이유는, 청크 증가로 인해 임베딩 작업이 더 빈번하게 일어나는 오버헤드 때문이 아닐까 추정된다.
#### ◼️ BM25 vs Embedding
- 결과적으로는, BM25 방식과 대비했을 때 (512 Context Size 기준) **NDCG@5가 17%(0.353 → 0.416) 개선**됐다.
- 또한 검색 시 BM25 방식에서 문자 하나하나를 읽어들여 비교하던 오버헤드가 사라졌으므로, **Avg Latency도 89%(215.3 → 23.5) 감소**하였음을 확인할 수 있다.
- 그러나 Embedding 과정에서의 높은 초기화 레이턴시와 메모리 사용량 오버헤드로 인해, 당장 오픈소스에 병합하기에는 무리가 있다고 판단했다.

# 5. 한계 & 더 개선할 부분
###### llama-cpp와의 데이터 교환 과정에서의 메모리 오버헤드
- `llama-cpp` 라이브러리에서는 모델의 호환성을 위해 추론 결과로 얻은 Float32 배열을 Float64로 반환한다. 하지만 `node-llama-cpp`에서는 js로 데이터를 가져오는 과정에서 다시 float32로 변환해 가져온다. → 이 과정에서 불필요한 Deep Copy가 일어난다.
- 때문에 Array buffer로 인한 메모리 오버헤드를 최소화할 방안을 고민해 봐야 한다.
###### 벡터 유사도 계산 알고리즘
- 현재는 모든 문서의 임베딩 벡터에 하나하나 유사도 연산을 수행하여 가장 유사한 문서를 뽑아낸다.
	- 이는 문서 개수 $N$, 문서당 평균 청크 개수 $M$개, 임베딩 벡터 크기 $K$ 를 가정했을 때, $\Theta(N*M*K)$의 시간 복잡도로 동작한다.
- 현재 벤치마크는 3,633개의 문서로 이루어져 있기 때문에 수십 ms 이내로 처리된다.
- 그러나 (1) 수십만 개 이상의 문서가 포함된 Vault 또는 (2) 각 문서가 매우 긴 로그성 데이터를 포함하고 있다면 시간복잡도가 선형적으로 증가한다.
	- e.g., 문서의 개수와 길이가 각각 벤치마크의 데이터셋보다 10배씩 크다면 검색할 때마다 2초 내외의 레이턴시가 소요되리라 예상할 수 있다. → 느리다..
- 때문에 추후 HNSW 등의 알고리즘으로 유사도 계산 과정의 오버헤드에 대비해야 한다.