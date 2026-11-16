# EngiRAG – Engineering Documentation RAG Assistant

EngiRAG is a portfolio-grade Retrieval-Augmented Generation (RAG) web application built with TypeScript, NestJS, Vue 3, PostgreSQL (`pgvector`), and local CPU embeddings (`Transformers.js`). It answers technical engineering questions exclusively from indexed public documentation and provides verifiable numbered citations (`[1]`, `[2]`) linked directly to original documentation pages and section anchors.

> **Project Status**: **Phase 4 (Vue 3 Frontend)** complete. Phase 5 will add the 25-question retrieval evaluation benchmark (`Hit@k` and `MRR`) and final public release documentation.

## Screenshot

_Placeholder — UI screenshot will be captured and linked after Phase 5 verification._

## Features

- **Phase 1 (Implemented)**:
  - Strict TypeScript NestJS backend with Zod startup environment validation
  - Direct PostgreSQL connectivity using `pg` connection pooling and plain SQL migrations
  - Docker Compose setup with `pgvector/pgvector:pg16` and an HNSW cosine vector index
  - `GET /health` endpoint verifying application and PostgreSQL readiness
  - ESLint, Prettier, Jest unit tests, and GitHub Actions CI (`lint`, `format:check`, `test`, `build`)
- **Phase 2 (Implemented)**:
  - Standalone document ingestion CLI (`npm run ingest`) fetching curated public Markdown pages directly over HTTPS (without cloning entire repositories)
  - Markdown parser preserving heading hierarchy (`H1 > H2 > H3`), ignoring `#` comments inside fenced code blocks, cleaning Hugo shortcodes and Dgeni `@@switch` blocks, and generating deterministic URL anchors
  - Two-stage heading-aware + token-aware chunking with configurable chunk size (`CHUNK_SIZE_TOKENS=500`) and overlap (`CHUNK_OVERLAP_TOKENS=75`)
  - Local CPU vector embeddings via `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`, 384 dimensions) behind an `EmbeddingProvider` interface
  - SHA-256 content-hash duplicate detection and transactional re-ingestion (`DELETE` + `INSERT` inside `withTransaction`) so updated documents leave no obsolete chunks behind
- **Phase 3 (Implemented)**:
  - `RetrievalService` computing query embeddings locally and ranking top-k chunks via `pgvector` cosine similarity (`1 - (embedding <=> query)`) with configurable `RETRIEVAL_MIN_SCORE`
  - `LlmProvider` interface supporting Groq (via official `openai` SDK with custom `baseURL`) and optional Gemini (`LLM_PROVIDER=groq|gemini`)
  - Bounded exponential backoff retries (`maxRetries=3`, `500ms -> 1000ms -> 2000ms`) for HTTP `429` and transient `502`/`503`/`504` errors, with `20s` timeouts and zero API key logging
  - `POST /ask` endpoint with Zod input validation, grounded prompt construction, inline `[n]` citation validation, and explicit insufficient-context fallback
- **Phase 4 (Implemented)**:
  - Vue 3 (`<script setup lang="ts">`) interface built with Vite and strict TypeScript
  - Separated typed API service (`frontend/src/services/rag-api.ts`) and XSS-safe inline citation parser (`parseAnswerSegments`)
  - Clickable `[1]`, `[2]` citation links opening the original documentation page and `#section` anchor, plus collapsible retrieved passages with similarity scores and verbatim excerpts
  - Explicit empty, loading, and error states plus Vitest + Vue Test Utils component tests
- **Planned (Phase 5)**:
  - Reproducible retrieval evaluation benchmark (`Hit@k` and `MRR`) across chunk sizes (`300`, `500`, `800`) and `k` values (`3`, `5`, `8`)

## Architecture

```mermaid
flowchart LR
  Client["Vue 3 Frontend (Vite SPA)"] -->|"POST /ask (HTTP REST)"| API["NestJS Backend"]
  API -->|"GET /health"| Health["HealthModule"]
  API -->|"POST /ask"| RAG["RagService"]
  RAG -->|"Local 384d CPU embeddings"| Embeddings["EmbeddingProvider (Transformers.js)"]
  RAG -->|"Top-k cosine search (<=>)"| DB[("PostgreSQL + pgvector")]
  RAG -->|"Prompt + bounded retries"| LLM["LlmProvider: Groq / Gemini"]
  CLI["Ingestion CLI"] -->|"Fetch curated Markdown"| GitHub["Public Docs Repos (GitHub Raw)"]
  CLI -->|"2-stage chunking + 384d vectors"| Embeddings
  CLI -->|"Transactional upsert + chunk replace"| DB
```

## Technology Stack

- **Backend**: Node.js LTS, TypeScript (`strict: true`), NestJS, Zod, `pg` (plain SQL, no ORM), Jest
- **Frontend**: Vue 3 (`<script setup>`), TypeScript, Vite, Vitest, Vue Test Utils
- **Vector Store**: PostgreSQL 16 + `pgvector` (HNSW index with `vector_cosine_ops`)
- **Embeddings**: `@huggingface/transformers` (`^4.3.2`) running `Xenova/all-MiniLM-L6-v2` locally on CPU (384 dimensions)
- **LLM Inference (Phase 3)**: Groq via OpenAI-compatible SDK (`LlmProvider` interface), optional Gemini
- **Infrastructure**: Docker, Docker Compose, ESLint, Prettier, GitHub Actions

## Quickstart

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

### 4. Ingest Public Documentation

```bash
# Ingest all curated COVESA VSS and NestJS documentation pages
npm run ingest

# Optional flags:
# npm run ingest -- --source=covesa_vss --limit=5
# npm run ingest -- --chunk-size=300 --chunk-overlap=50 --force
```

### 5. Start the Backend and Frontend Servers

In terminal 1 (NestJS API on port `3000`):

```bash
npm run start:dev
```

In terminal 2 (Vue 3 SPA on port `5173`):

```bash
npm --prefix frontend install
npm run dev:frontend
```

Open `http://localhost:5173` in your browser, or verify the backend health endpoint directly:

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
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Groq model name |
| `GEMINI_API_KEY` | `""` | Optional Gemini API key (Phase 3) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name |
| `CHUNK_SIZE_TOKENS` | `500` | Target maximum token count per chunk |
| `CHUNK_OVERLAP_TOKENS` | `75` | Overlap tokens between adjacent oversized chunks |
| `RETRIEVAL_TOP_K` | `5` | Maximum chunks retrieved per query (Phase 3) |
| `RETRIEVAL_MIN_SCORE` | `0.35` | Minimum cosine similarity threshold for retrieved chunks (Phase 3) |

## Ingestion Process

The standalone CLI (`backend/scripts/ingest.ts`) runs inside a headless NestJS `ApplicationContext` without starting the HTTP server:

1. Fetches a curated list of public Markdown files (`DOCUMENTATION_SOURCES` in `backend/src/ingestion/documentation-sources.ts`) via HTTPS with a 15-second timeout.
2. Computes a SHA-256 hash combining the raw Markdown content, `chunkSizeTokens`, `chunkOverlapTokens`, and `embeddingModel`.
3. Skips unchanged documents whose stored `content_hash` already matches (unless `--force` is passed).
4. Parses and chunks changed/new documents using the two-stage chunker (`chunkMarkdownDocument`).
5. Generates 384-dimensional normalized embeddings in batches of 16 using `TransformersEmbeddingProvider`.
6. Inside a single PostgreSQL transaction (`DatabaseService.withTransaction`), upserts the `documents` row, deletes any previous `document_chunks` rows for that `document_id`, and inserts the new chunks so updates never leave orphaned chunks behind.
7. Reports counts for documents fetched, processed, skipped, chunks created, embeddings generated, database records affected, and explicit per-stage errors (`fetch`, `chunk`, `embed`, `database`).

## Chunking Strategy

EngiRAG uses a **two-stage heading-aware chunking pipeline** (`backend/src/ingestion/markdown-parser.ts` and `chunker.ts`):

1. **Stage 1 – Heading-Boundary Separation**:
   - Strips generator artifacts (YAML frontmatter, Hugo `{{% notice %}}` wrappers, `<figure>` tags, and NestJS Dgeni `@@filename` / `@@switch` JavaScript duplicates).
   - Tracks fenced code blocks (```` ``` ```` / `~~~`) so `#` comments inside YAML, TypeScript, or bash examples are never mistaken for headings.
   - Splits content along Markdown headings while preserving full heading paths (e.g., `Controllers > Routing`) and deterministic section anchors (`#routing`). Unrelated sections are never merged into the same chunk.
2. **Stage 2 – Bounded Size Splitting with Overlap**:
   - Sections exceeding `CHUNK_SIZE_TOKENS` (default `500`) are split along paragraph boundaries (keeping fenced code blocks intact where possible), then sentence boundaries, and finally token windows as a fallback for unusually long blocks.
   - Adjacent chunks within the same oversized section carry up to `CHUNK_OVERLAP_TOKENS` (default `75`) trailing units forward so context split at a boundary remains recoverable.

**Trade-offs of initial defaults (`500` tokens, `75` overlap)**:
- Smaller chunks (`300` tokens) produce sharper single-fact embeddings but risk splitting code examples from surrounding explanations.
- Larger chunks (`800` tokens) preserve broad context but dilute vector specificity when multiple concepts share one embedding (`all-MiniLM-L6-v2` truncates inputs beyond ~256 WordPiece tokens anyway).
- `500` tokens (estimated with an offline subword-style heuristic) serves as an initial baseline that will be evaluated empirically in Phase 5 against `300` and `800`.

## Embedding Model Selection

- **Package**: `@huggingface/transformers` (`^4.3.2`, the official v3/v4 successor to `@xenova/transformers`, providing native Node CommonJS exports `./dist/transformers.node.cjs` and TypeScript declarations).
- **Model**: `Xenova/all-MiniLM-L6-v2` running locally on CPU (`dtype: 'fp32'`, mean pooling, L2-normalized outputs of **384 dimensions**).
- **Why chosen**: Zero API cost, no rate limits during batch ingestion, deterministic offline behavior after initial model caching, and compact 384d vectors that fit fast in-memory HNSW indexes.
- **Known Limitations**:
  - Trained primarily on English general-domain semantic similarity pairs rather than specialized automotive or NestJS TypeScript jargon.
  - Truncates long passages at its transformer sequence limit (256 WordPiece tokens), meaning information near the very end of large (~500–800 token) chunks contributes less to the vector representation.
  - Preprocessing (`normalizeEmbeddingInput`) and the `EmbeddingProvider` contract are shared between ingestion and retrieval so vectors always live in the same embedding space.

## Retrieval Methodology

`RetrievalService` (`backend/src/retrieval/retrieval.service.ts`) generates a 384-dimensional query vector using the exact same `EmbeddingProvider` (`normalizeEmbeddingInput` + `Xenova/all-MiniLM-L6-v2`) used during ingestion. PostgreSQL queries `document_chunks` using the `pgvector` cosine distance operator (`<=>`), converting distance to cosine similarity via `1 - (embedding <=> $1::vector)`:

- **Similarity threshold**: Results below `RETRIEVAL_MIN_SCORE` (default `0.35`) are filtered out so off-topic questions do not force irrelevant chunks into the LLM prompt.
- **Top-k limit**: Returns at most `RETRIEVAL_TOP_K` (default `5`) highest-scoring passages ordered by ascending cosine distance (`embedding <=> $1::vector ASC`).
- **HNSW indexing**: `idx_document_chunks_embedding_hnsw` (`vector_cosine_ops`) supports incremental inserts without requiring centroid re-training.
- **Source links**: Stored base `source_url` and `section_anchor` are combined on retrieval (`https://...#anchor`) so citations link directly to the relevant documentation section.

## LLM Provider Architecture

LLM calls sit behind the `LlmProvider` contract (`backend/src/llm/llm.provider.ts`) and are selected at runtime via `LLM_PROVIDER` (`groq` or `gemini`):

- **Primary (`GroqLlmProvider`)**: Uses the official `openai` npm package configured with Groq's OpenAI-compatible `baseURL` (`https://api.groq.com/openai/v1`), `temperature: 0.1`, `max_tokens: 600`, and a 20-second request timeout.
- **Optional (`GeminiLlmProvider`)**: Calls Gemini's `generateContent` endpoint with the API key passed in `x-goog-api-key` headers (never in URLs or logs).
- **Rate-limit & Error Handling**: Both providers disable SDK automatic retries and use `withBoundedRetry` (`backend/src/llm/retry.util.ts`) for bounded exponential backoff (`500ms -> 1000ms -> 2000ms`, capped at `maxRetries = 3`) on HTTP `429`, `502`, `503`, and `504`. Non-retryable `400`/`401`/`403` errors fail immediately and map cleanly to HTTP responses without exposing secrets.

## Citation Handling & Hallucination Mitigation

1. **Zero-Hit Short-Circuit**: When `RetrievalService` returns `0` chunks above `RETRIEVAL_MIN_SCORE`, `RagService` immediately returns `INSUFFICIENT_CONTEXT_MESSAGE` with `sources: []` without calling the LLM.
2. **Grounded Prompting**: `buildGroundedPrompts` instructs the model to answer exclusively from numbered sources `[1]..[k]` and explicitly state when evidence is insufficient.
3. **Post-Generation Citation Validation**: `validateAndSanitizeCitations` inspects all inline `[n]` markers, strips any out-of-range references (`n < 1` or `n > sources.length`), and falls back to `INSUFFICIENT_CONTEXT_MESSAGE` if a non-refusal response contains zero valid citations.
4. **Honest Limitations**: Prompt instructions and `[n]` bracket validation **cannot** guarantee semantic truth—an LLM can still misinterpret a passage while attaching a syntactically valid `[1]` marker. For this reason, retrieved `sources` (with verbatim excerpts, scores, and original URLs) are always returned separately so users can verify claims directly.

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
- **Curated raw Markdown fetches over full repo cloning**: Downloading only selected documentation pages keeps ingestion fast, transparent, and decoupled from unrelated build/asset files in upstream repositories.
- **Local CPU embeddings over paid embedding APIs**: Eliminates recurring API costs and external rate limits during document ingestion and evaluation experiments, at the cost of slower CPU throughput and a 256-token model sequence ceiling.

## Limitations

- Phases 1–4 cover infrastructure, ingestion, retrieval, grounded `POST /ask`, and the Vue 3 web interface; empirical `Hit@k`/`MRR` retrieval evaluation benchmarks across chunk sizes are deferred to Phase 5.
- `estimateTokenCount` uses an offline subword-approximation regex rather than running the Hugging Face WordPiece tokenizer directly, so actual model token counts can differ slightly from configured chunk limits.
- Syntactic citation validation (`[1]..[k]`) removes out-of-range markers and blocks uncited claims, but does not verify semantic entailment between a claim and its cited excerpt.

## Testing Instructions

Run lint, formatting check, unit tests, and build across **both** backend and frontend from the repository root:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

Or run frontend checks individually from `frontend/`:

```bash
npm run lint
npm run format:check
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
│   │   ├── ingest.ts
│   │   └── migrate.ts
│   ├── src/
│   │   ├── config/
│   │   ├── database/
│   │   ├── embeddings/
│   │   ├── health/
│   │   ├── ingestion/
│   │   ├── common/
│   │   ├── documents/
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
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── types/
│   │   ├── views/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   ├── style.css
│   │   └── vite-env.d.ts
│   ├── tests/
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
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

Repositories and documentation pages were inspected on **2026-11-16**:

| Source | Repository | Published Docs | Source Path | License | Notes |
| --- | --- | --- | --- | --- | --- |
| **COVESA Vehicle Signal Specification (VSS)** | [COVESA/vehicle_signal_specification](https://github.com/COVESA/vehicle_signal_specification) | [covesa.github.io/vehicle_signal_specification](https://covesa.github.io/vehicle_signal_specification/) | `docs-gen/content/**/*.md` (20 curated files) | **Mozilla Public License 2.0 (`MPL-2.0`)** | Verified in root `LICENSE` and `docs-gen/content/license/_index.md`. Weak file-level copyleft; permits use and citation when retaining license notice and linking source. |
| **NestJS Official Documentation** | [nestjs/docs.nestjs.com](https://github.com/nestjs/docs.nestjs.com) | [docs.nestjs.com](https://docs.nestjs.com/) | `content/**/*.md` (16 curated files) | **MIT License (`MIT`)** | Verified in root `LICENSE` and `README.md` (`Copyright (c) 2017-present Kamil Myśliwiec`), explicitly covering software and associated documentation files. |

Only Markdown documentation files listed in `backend/src/ingestion/documentation-sources.ts` are fetched; non-Markdown assets (images/icons) are not redistributed.

## Attribution

- **COVESA Vehicle Signal Specification** documentation excerpts and citations are sourced from the [COVESA VSS repository](https://github.com/COVESA/vehicle_signal_specification) under **MPL-2.0**.
- **NestJS Documentation** excerpts and citations are sourced from the [nestjs/docs.nestjs.com repository](https://github.com/nestjs/docs.nestjs.com) under the **MIT License**, Copyright (c) 2017–present Kamil Myśliwiec.

## Future Improvements

- Phase 5: 25-question retrieval evaluation dataset and `Hit@k` / `MRR` comparison across `300`, `500`, and `800` token chunks and `k = 3, 5, 8`.
