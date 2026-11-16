# EngiRAG Architecture Overview

> Status: **Phases 1–2** completed (Infrastructure Foundation + Document Ingestion & Local Embeddings). Phases 3–5 will add pgvector semantic retrieval, grounded LLM answering, Vue 3 UI, and retrieval evaluation.

## System Architecture

```mermaid
flowchart LR
  User["User (Browser)"] -->|"Vue 3 SPA (Phase 4)"| API["NestJS REST API"]
  API -->|"GET /health"| Health["HealthModule"]
  API -->|"POST /ask (Phase 3)"| RAG["RagService"]
  RAG -->|"Embed query (384d)"| Emb["EmbeddingProvider (Transformers.js)"]
  RAG -->|"Cosine similarity (<=>)"| PG[("PostgreSQL 16 + pgvector (HNSW)")]
  RAG -->|"Grounded prompt + citations"| LLM["LlmProvider (Groq / Gemini)"]
  Ingest["Ingestion CLI (Phase 2)"] -->|"Fetch curated Markdown"| Docs["GitHub Raw (COVESA VSS / NestJS)"]
  Ingest -->|"2-stage chunking"| Emb
  Ingest -->|"Transactional upsert + replace"| PG
```

## Phase 1 Infrastructure Decisions

1. **Direct SQL via `pg` instead of an ORM**: Keeps vector operators (`<=>`), HNSW index definitions, and transactional batch operations transparent and inspectable.
2. **Startup validation with Zod**: `validateEnv` validates all configuration keys at boot and surfaces field-level errors without exposing secret values.
3. **pgvector HNSW index (`vector_cosine_ops`)**: Supports incremental document ingestion without requiring an upfront training step (unlike IVFFlat), while offering fast approximate nearest-neighbor search.

## Phase 2 Ingestion & Embedding Decisions

1. **`@huggingface/transformers` (`^4.3.2`) with `Xenova/all-MiniLM-L6-v2`**: Runs locally on CPU via ONNX Runtime (`transformers.node.cjs`), producing 384-dimensional L2-normalized vectors with zero API cost and full CommonJS compatibility inside NestJS.
2. **Two-Stage Heading-Aware Chunking**: First splits Markdown along heading boundaries while preserving heading hierarchy and section anchors (ignoring `#` inside code fences); second splits oversized sections along paragraph/sentence boundaries with overlap so unrelated topics never bleed together.
3. **Content-Hash Idempotency + Transactional Chunk Replacement**: Computes a SHA-256 hash across raw Markdown, chunk size, overlap, and embedding model name; unchanged documents are skipped, and updated documents delete prior chunks before inserting replacements inside a single PostgreSQL transaction.
