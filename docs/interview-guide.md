# EngiRAG Technical Interview Preparation Guide

Concise, honest answers to core architecture and AI-engineering questions you can use when presenting EngiRAG in interviews.

---

### 1. Why `pgvector` instead of a dedicated vector database?
- **Operational simplicity**: One PostgreSQL instance handles both relational document metadata (`documents.content_hash`, `external_id`, `source_url`) and 384-dimensional vector search (`document_chunks.embedding`).
- **ACID transactions**: During re-ingestion (`IngestionService.persistDocumentAndChunks`), updating `documents`, deleting stale chunks (`DELETE FROM document_chunks WHERE document_id = $1`), and inserting new vectors happen atomically inside one SQL transaction—eliminating sync drift between a metadata store and an external vector store.
- **Trade-off**: Dedicated vector databases (Qdrant, Milvus, Weaviate) offer distributed sharding, built-in hybrid BM25+dense pipelines, and multi-billion-vector scaling; for a scoped documentation corpus (~hundreds to low-millions of chunks), `pgvector` with an HNSW index is simpler, free, and fast.

### 2. Why local CPU embeddings (`Transformers.js`) instead of a paid API?
- **Zero cost and zero rate limits**: Batch ingesting 36 documents and running 3× re-indexing evaluation benchmarks across 300/500/800 token sizes runs locally via ONNX Runtime (`@huggingface/transformers`) with no API charges or throttling.
- **Same space guarantee**: Both `IngestionService` and `RetrievalService` share the exact same `EmbeddingProvider` contract and `normalizeEmbeddingInput()` helper (`Xenova/all-MiniLM-L6-v2`, 384d).
- **Trade-off**: Slower batch throughput on CPU than GPU/API inference, English general-domain training bias, and a 256-WordPiece-token truncation window.

### 3. Why two-stage heading-aware chunking?
- **Stage 1 (Heading boundaries)**: Splitting along `#`–`######` headings prevents unrelated topics (e.g., *Braking System* vs. *Steering System*) from sharing a single vector, and preserves `headingHierarchy` + `#section-anchor` URLs for direct citations.
- **Stage 2 (Bounded splitting + overlap)**: Sections larger than `CHUNK_SIZE_TOKENS` split cleanly at paragraph/sentence boundaries (keeping fenced code blocks intact) with `CHUNK_OVERLAP_TOKENS` carried forward so context near split edges isn't lost.

### 4. Why 500 tokens as the initial chunk size?
- It is an **experimental baseline**, not an assumed optimum: small enough to avoid mixing many subtopics into one vector and keep LLM prompt context lean for Groq free-tier limits, yet large enough to hold a multi-sentence explanation plus a short code snippet.
- Phase 5 directly tests `300`, `500`, and `800` tokens empirically using `Hit@k` and `MRR` (`evaluation/results/retrieval-evaluation.md`) to justify the trade-offs with real numbers.

### 5. Why use top-k retrieval with a similarity threshold?
- **Top-k (`RETRIEVAL_TOP_K=5`)**: Caps prompt token usage, latency, and noise passed to the LLM.
- **Similarity threshold (`RETRIEVAL_MIN_SCORE=0.35`)**: Top-k alone *always* returns `k` chunks—even for off-topic questions like *"How do I bake sourdough bread?"*. Filtering by `1 - (embedding <=> $1::vector) >= 0.35` lets `RagService` short-circuit immediately with an insufficient-context response without invoking the LLM.

### 6. How does cosine similarity work in `pgvector`?
- Cosine similarity measures the cosine of the angle between two vectors: $\cos(\theta) = \frac{A \cdot B}{\|A\|\|B\|} \in [-1, 1]$, focusing on semantic orientation rather than magnitude.
- `pgvector`'s `<=>` operator returns **cosine distance** ($1 - \cos(\theta)$), so we order ascending by `embedding <=> $1::vector ASC` (which uses `idx_document_chunks_embedding_hnsw` with `vector_cosine_ops`) and compute similarity as `1 - (embedding <=> $1::vector)`.

### 7. Why use an `LlmProvider` interface?
- Decouples `RagService` from vendor SDKs (`openai` for Groq vs. Gemini REST `fetch`), enables runtime switching via `LLM_PROVIDER=groq|gemini`, enforces uniform bounded retries (`429` exponential backoff) and `20s` timeouts, and allows deterministic Jest unit testing with a mocked `LlmProvider`.

### 8. How do citations work end-to-end?
- `RetrievalService` maps each retrieved chunk to `1..k` with its real page URL + `#section_anchor`.
- `buildGroundedPrompts` embeds numbered source blocks (`[1] Title | Section | URL`) in the prompt.
- `validateAndSanitizeCitations` parses `[n]` markers, removes out-of-range references, and rejects uncited non-refusal outputs.
- The frontend `parseAnswerSegments` tokenizes `[n]` without `v-html` into clickable links opening the original docs section and highlighting the matching passage in `SourcesList`.

### 9. How do you handle hallucinations?
- **Defense in depth**: (1) retrieval score threshold short-circuit on 0 hits, (2) low LLM temperature (`0.1`) + strict system prompt constraints, (3) post-generation citation validation stripping out-of-range `[n]` and falling back to `INSUFFICIENT_CONTEXT_MESSAGE` when zero valid citations exist, and (4) returning verbatim `sources` excerpts separately so users can verify claims.
- **Honest limitation**: Syntactic bracket checks cannot prove semantic entailment—an LLM can still misread a passage while attaching `[1]`.

### 10. What do `Hit@k` and `MRR` measure (and NOT measure)?
- **Hit@k**: Fraction of questions where at least one chunk from the expected source page appears in the top `k` results (measures top-k recall).
- **MRR (Mean Reciprocal Rank)**: Mean of `1 / rank` for the *first* relevant source page in top `k` (measures ranking precision—rank `1` scores `1.0`, rank `2` scores `0.5`).
- **Not measured**: Downstream LLM answer quality, factual faithfulness, citation precision, or end-to-end latency.

### 11. How do you test an LLM/RAG application?
- **Deterministic unit tests (CI)**: Mock `EmbeddingProvider`, `DatabaseService`, and `LlmProvider` (`openai` SDK) to test chunk boundaries, SQL parameters, `429` exponential backoff, citation sanitization, `0`-hit fallback, and Vue component loading/error/citation states with zero API calls.
- **Offline metric tests**: Unit-test `Hit@k` and `MRR` math (`evaluation-metrics.spec.ts`).
- **Live retrieval evaluation**: Run real embeddings + `pgvector` queries (`npm run evaluate`) over a 25-question benchmark dataset.

### 12. What are the limitations of this architecture?
1. **Dense-only retrieval**: No BM25/keyword hybrid search (`tsvector` + RRF), so exact identifier lookups (e.g., obscure signal codes or symbol names) rely purely on semantic similarity.
2. **256-token embedding ceiling**: `all-MiniLM-L6-v2` truncates longer chunks, reducing sensitivity to text near the tail of 500–800 token chunks.
3. **Regex token approximation**: `estimateTokenCount` approximates subword tokens offline rather than invoking the exact Hugging Face WordPiece tokenizer.
4. **No cross-encoder reranking or semantic entailment verification**: Adding a local cross-encoder reranker and automated groundedness checks are natural next improvements.
