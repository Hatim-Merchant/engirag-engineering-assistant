# EngiRAG Architecture Overview

> Status: **Phase 1 (Foundation)** completed. Phases 2–5 will add document ingestion, pgvector retrieval, LLM grounding, Vue 3 UI, and retrieval evaluation.

## System Architecture

```mermaid
flowchart LR
  User["User (Browser)"] -->|"Vue 3 SPA (Phase 4)"| API["NestJS REST API"]
  API -->|"GET /health"| Health["HealthModule"]
  API -->|"POST /ask (Phase 3)"| RAG["RagService"]
  RAG -->|"Embed query (384d)"| Emb["EmbeddingProvider (Transformers.js)"]
  RAG -->|"Cosine similarity (<=>)"| PG[("PostgreSQL 16 + pgvector (HNSW)")]
  RAG -->|"Grounded prompt + citations"| LLM["LlmProvider (Groq / Gemini)"]
  Ingest["Ingestion CLI (Phase 2)"] -->|"Fetch & chunk Markdown"| PG
  Ingest --> Emb
```

## Phase 1 Infrastructure Decisions

1. **Direct SQL via `pg` instead of an ORM**: Keeps vector operators (`<=>`), HNSW index definitions, and transactional batch operations transparent and inspectable.
2. **Startup validation with Zod**: `validateEnv` validates all configuration keys at boot and surfaces field-level errors without exposing secret values.
3. **pgvector HNSW index (`vector_cosine_ops`)**: Supports incremental document ingestion without requiring an upfront training step (unlike IVFFlat), while offering fast approximate nearest-neighbor search.
