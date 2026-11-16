# EngiRAG – Engineering Documentation RAG Assistant

EngiRAG is a portfolio-grade Retrieval-Augmented Generation (RAG) web application built with TypeScript, NestJS, Vue 3, PostgreSQL (`pgvector`), and local CPU embeddings (`Transformers.js`). It answers technical engineering questions exclusively from indexed public documentation and provides verifiable numbered citations (`[1]`, `[2]`) linked directly to original documentation pages and section anchors.

> **Project Status**: Phase 1 (Repository and Infrastructure Foundation) complete. Subsequent phases will add document ingestion, semantic retrieval, grounded LLM answering, the Vue 3 interface, and retrieval evaluation.

## Screenshot

_Placeholder — UI screenshot will be added after Phase 4 (Vue 3 frontend) is complete._

## Features

- **Phase 1 (Implemented)**:
  - Strict TypeScript NestJS backend with Zod startup environment validation
  - Direct PostgreSQL connectivity using `pg` connection pooling and plain SQL migrations
  - Docker Compose setup with `pgvector/pgvector:pg16` and an HNSW cosine vector index
  - `GET /health` endpoint verifying application and PostgreSQL readiness
  - ESLint, Prettier, Jest unit tests, and GitHub Actions CI (`lint`, `format:check`, `test`, `build`)
- **Planned (Phases 2–5)**:
  - Heading-aware Markdown ingestion CLI with local Transformers.js embeddings (`Xenova/all-MiniLM-L6-v2`)
  - Grounded `POST /ask` endpoint with Groq (and optional Gemini) behind an `LlmProvider` interface
  - Vue 3 (`script setup`) chat interface with clickable numbered citations and collapsible source passages
  - Reproducible retrieval evaluation benchmark (`Hit@k` and `MRR`) across chunk sizes and `k` values

## Architecture

```mermaid
flowchart LR
  Client["Vue 3 Frontend (Phase 4)"] -->|"HTTP REST"| API["NestJS Backend"]
  API -->|"GET /health"| Health["HealthModule"]
  API -->|"POST /ask (Phase 3)"| RAG["RagService"]
  RAG -->|"Local 384d CPU embeddings"| Embeddings["EmbeddingProvider (Phase 2/3)"]
  RAG -->|"Top-k cosine search (<=>)"| DB[("PostgreSQL + pgvector")]
  RAG -->|"Prompt + retries"| LLM["LlmProvider: Groq / Gemini (Phase 3)"]
  CLI["Ingestion CLI (Phase 2)"] -->|"Markdown chunks + vectors"| DB
  CLI --> Embeddings
```

## Technology Stack

- **Backend**: Node.js LTS, TypeScript (`strict: true`), NestJS, Zod, `pg` (plain SQL, no ORM), Jest
- **Frontend (Phase 4)**: Vue 3 (`script setup`), TypeScript, Vite, Vitest, Vue Test Utils
- **Vector Store**: PostgreSQL 16 + `pgvector` (HNSW index with `vector_cosine_ops`)
- **Embeddings (Phase 2/3)**: Transformers.js (`Xenova/all-MiniLM-L6-v2`, local CPU, 384 dimensions)
- **LLM Inference (Phase 3)**: Groq via OpenAI-compatible SDK (`LlmProvider` interface), optional Gemini
- **Infrastructure**: Docker, Docker Compose, ESLint, Prettier, GitHub Actions

## Quickstart (Phase 1)

### Prerequisites

- Node.js 22+ (or Node LTS) and npm
- Docker Desktop / Docker Engine with Compose

### 1. Configure Environment Variables

```bash
cp .env.example .env
```

### 2. Start PostgreSQL + pgvector

```bash
docker compose up -d postgres
```

### 3. Install Backend Dependencies and Run Migrations

```bash
cd backend
npm install
npm run migrate
```

### 4. Start the Backend Server

```bash
npm run start:dev
```

Verify the health endpoint:

```bash
curl http://localhost:3000/health
```

## Docker Compose Instructions

Start PostgreSQL with `pgvector`:

```bash
docker compose up -d postgres
```

Check container status and logs:

```bash
docker compose ps
docker compose logs -f postgres
```

Stop services (preserving volume `pgdata`):

```bash
docker compose down
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Application runtime environment (`development`, `test`, `production`) |
| `PORT` | `3000` | HTTP port for the NestJS backend |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origin for the Vue frontend |
| `POSTGRES_HOST` | `localhost` | PostgreSQL hostname |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `engirag` | PostgreSQL database user |
| `POSTGRES_PASSWORD` | `engirag_dev_password` | PostgreSQL database password |
| `POSTGRES_DB` | `engirag` | PostgreSQL database name |
| `DATABASE_URL` | `postgresql://engirag:engirag_dev_password@localhost:5432/engirag` | Full PostgreSQL connection string validated at startup |
| `EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Transformers.js embedding model identifier |
| `EMBEDDING_DIMENSIONS` | `384` | Vector dimensionality matching `document_chunks.embedding` |
| `LLM_PROVIDER` | `groq` | Active LLM provider (`groq` or `gemini`) |
| `GROQ_API_KEY` | `""` | API key for Groq inference (Phase 3; never expose in frontend or logs) |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible base URL for Groq |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Groq model name |
| `GEMINI_API_KEY` | `""` | Optional Gemini API key (Phase 3) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name |
| `CHUNK_SIZE_TOKENS` | `500` | Target maximum token count per chunk (Phase 2) |
| `CHUNK_OVERLAP_TOKENS` | `75` | Overlap tokens between adjacent oversized chunks (Phase 2) |
| `RETRIEVAL_TOP_K` | `5` | Maximum chunks retrieved per query (Phase 3) |
| `RETRIEVAL_MIN_SCORE` | `0.35` | Minimum cosine similarity threshold for retrieved chunks (Phase 3) |

## Ingestion Process

_Pending Phase 2 implementation._

## Chunking Strategy

_Pending Phase 2 implementation._

## Embedding Model Selection

_Pending Phase 2 verification of library version, compatibility, and output dimensions (`Xenova/all-MiniLM-L6-v2` planned, 384d)._

## Retrieval Methodology

Chunks are stored in PostgreSQL with `pgvector` (`vector(384)`) and indexed with HNSW using `vector_cosine_ops` (`<=>` cosine distance). Full query pipeline pending Phase 3.

## LLM Provider Architecture

_Pending Phase 3 implementation (`LlmProvider` interface with Groq and optional Gemini)._

## Citation Handling & Hallucination Mitigation

_Pending Phase 3 implementation._

## Evaluation Methodology & Results

_Pending Phase 5 execution. No benchmark numbers will be added until experiments actually run._

| Chunk Size | Top-k | Hit@k | MRR | Status |
| --- | --- | --- | --- | --- |
| 300 tokens | 3 / 5 / 8 | Pending | Pending | Pending |
| 500 tokens | 3 / 5 / 8 | Pending | Pending | Pending |
| 800 tokens | 3 / 5 / 8 | Pending | Pending | Pending |

## Design Decisions and Trade-offs

- **PostgreSQL + `pgvector` over a standalone vector database**: Reduces operational complexity (one database for relational document metadata and vector embeddings) and provides ACID transactions when updating or replacing document chunks.
- **Plain SQL with `pg` over an ORM**: Gives full control over SQL migrations, `vector(384)` types, HNSW indexing parameters, and parameterized queries.
- **Zod startup validation**: Catches misconfigured environment variables immediately on startup with safe, field-level diagnostics.

## Limitations

- Phase 1 establishes the backend infrastructure, database schema, and CI foundation; ingestion, retrieval, LLM integration, frontend UI, and evaluation benchmarks are intentionally deferred to Phases 2–5.

## Testing Instructions

Run backend lint, formatting check, unit tests, and build from `backend/`:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

Or from the repository root:

```bash
npm run lint
npm test
npm run build
```

## Project Structure

```text
engirag-engineering-assistant/
├── backend/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   ├── scripts/
│   │   └── migrate.ts
│   ├── src/
│   │   ├── config/
│   │   ├── database/
│   │   ├── health/
│   │   ├── common/
│   │   ├── documents/
│   │   ├── embeddings/
│   │   ├── ingestion/
│   │   ├── llm/
│   │   ├── retrieval/
│   │   ├── rag/
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── test/
│   ├── Dockerfile
│   ├── jest.config.ts
│   ├── nest-cli.json
│   ├── package.json
│   ├── tsconfig.build.json
│   └── tsconfig.json
├── docs/
│   └── architecture.md
├── evaluation/
│   └── results/
├── frontend/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
└── README.md
```

## Data Sources and Licenses

_Repositories and exact licenses (COVESA Vehicle Signal Specification and NestJS documentation) will be inspected, verified, and documented with access dates in Phase 2 prior to ingestion._

## Attribution

_To be completed in Phase 2 alongside verified license requirements._

## Future Improvements

- Phases 2–5: Document ingestion CLI, semantic retrieval + Groq/Gemini `POST /ask`, Vue 3 web UI, and `Hit@k`/`MRR` evaluation experiments.
