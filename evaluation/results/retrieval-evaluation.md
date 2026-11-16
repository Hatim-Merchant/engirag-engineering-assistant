# EngiRAG Retrieval Evaluation Report

- **Generated at**: 2026-11-16T18:43:19.508Z
- **Corpus**: 36 public Markdown documents (20 COVESA VSS + 16 NestJS)
- **Evaluation dataset**: 25 technical questions (`evaluation/questions.json`)
- **Embedding model**: `Xenova/all-MiniLM-L6-v2` (local CPU, 384 dimensions)
- **Retrieval configuration**: PostgreSQL `pgvector` cosine similarity (`1 - (embedding <=> query)`), `minScore = 0` across top-8 candidates so `Hit@3`, `Hit@5`, and `Hit@8` measure pure ranking quality
- **Overlap**: 75 tokens

## Corpus Chunking Summary

| Chunk Size | Overlap | Documents Indexed | Total Chunks | Ingestion Time (s) |
| --- | --- | --- | --- | --- |
| 300 tokens | 75 tokens | 36 | 479 | 19.08s |
| 500 tokens | 75 tokens | 36 | 362 | 9.77s |
| 800 tokens | 75 tokens | 36 | 312 | 8.50s |

## Retrieval Metrics Comparison (Hit@k & MRR)

| Chunk Size | Top-k | Hits | Hit@k | MRR | Section Hit@k |
| --- | --- | --- | --- | --- | --- |
| 300 tokens | 3 | 24/25 | 0.9600 (96.0%) | 0.9133 | 7/14 (50.0%) |
| 300 tokens | 5 | 25/25 | 1.0000 (100.0%) | 0.9213 | 10/14 (71.4%) |
| 300 tokens | 8 | 25/25 | 1.0000 (100.0%) | 0.9213 | 11/14 (78.6%) |
| 500 tokens | 3 | 25/25 | 1.0000 (100.0%) | 0.9400 | 8/14 (57.1%) |
| 500 tokens | 5 | 25/25 | 1.0000 (100.0%) | 0.9400 | 10/14 (71.4%) |
| 500 tokens | 8 | 25/25 | 1.0000 (100.0%) | 0.9400 | 11/14 (78.6%) |
| 800 tokens | 3 | 25/25 | 1.0000 (100.0%) | 0.9200 | 9/14 (64.3%) |
| 800 tokens | 5 | 25/25 | 1.0000 (100.0%) | 0.9200 | 10/14 (71.4%) |
| 800 tokens | 8 | 25/25 | 1.0000 (100.0%) | 0.9200 | 10/14 (71.4%) |

## Analysis & Trade-offs

- **Observed Top-5 Winner**: `500`-token chunking achieved the highest MRR@5 (**0.9400**) with **100.0%** Hit@5 across the 25 questions.
- **Smaller chunks (300 tokens)** create more granular vectors (higher chunk count) so individual concepts do not compete inside one embedding, at the cost of occasionally separating an explanation from a following code snippet.
- **Larger chunks (800 tokens)** keep wider section context together, but because `Xenova/all-MiniLM-L6-v2` truncates inputs beyond ~256 WordPiece tokens, details located late in an 800-token chunk contribute less to the pooled vector.
- **Default 500 tokens** balances vector specificity and coherent multi-paragraph context while keeping retrieved LLM prompts concise.

## What Hit@k and MRR Measure (and Do Not Measure)

- **Hit@k** measures recall in the top-k results: the fraction of questions where at least one chunk from the expected source page appears within ranks `1..k`.
- **MRR (Mean Reciprocal Rank)** measures ranking precision for the *first* relevant source page (`1 / rank` of the first matching chunk, `0` if absent within top-k), rewarding configurations that place the right document at rank `1` rather than rank `5`.
- **What they do NOT measure**: Neither metric measures downstream LLM answer correctness, faithfulness, citation accuracy, latency, or whether the retrieved passage contains the exact line needed to answer a nuanced multi-hop question.

## Per-Question Diagnostics (500-token chunks, k = 5)

| ID | First Relevant Rank | Top Retrieved Source | Score | Question |
| --- | --- | --- | --- | --- |
| q01 | Rank 1 | `docs-gen/content/introduction/overview.md` | 0.6848 | What is the purpose of the Vehicle Signal Specification? |
| q02 | Rank 1 | `docs-gen/content/introduction/taxonomy.md` | 0.8660 | What are the components of a domain taxonomy in VSS? |
| q03 | Rank 1 | `docs-gen/content/rule_set/basics.md` | 0.6315 | What naming conventions and CamelCase rules apply in the VSS style guide? |
| q04 | Rank 1 | `docs-gen/content/rule_set/branches.md` | 0.6161 | What is a Branch entry in VSS and what attributes are mandatory for it? |
| q05 | Rank 1 | `docs-gen/content/rule_set/includes.md` | 0.7624 | How do include directives reuse signal trees across multiple vspec files? |
| q06 | Rank 2 | `docs-gen/content/extensions/overlay.md` | 0.5469 | How can I instantiate repeating physical vehicle elements like doors or wheels in VSS? |
| q07 | Rank 1 | `docs-gen/content/rule_set/data_entry/sensor_actuator.md` | 0.6559 | What is the difference between a sensor, an actuator, and an attribute in VSS? |
| q08 | Rank 2 | `docs-gen/content/policies/unit_datatype.md` | 0.7003 | Which primitive and array datatypes are supported for VSS signals? |
| q09 | Rank 1 | `docs-gen/content/rule_set/data_entry/data_types_struct.md` | 0.7464 | How are struct data types and inline structs defined in VSS? |
| q10 | Rank 1 | `docs-gen/content/policies/unit_datatype.md` | 0.7838 | How are measurement units specified and validated in VSS signal definitions? |
| q11 | Rank 1 | `docs-gen/content/rule_set/data_entry/enum.md` | 0.7366 | How do allowed values and enum mappings differ when constraining a VSS signal? |
| q12 | Rank 1 | `docs-gen/content/extensions/overlay.md` | 0.6305 | How does the VSS overlay mechanism extend or delete signals without editing the standard catalog? |
| q13 | Rank 1 | `docs-gen/content/catalog/vehicle_motion_management.md` | 0.5714 | How does VSS model vehicle force distribution and braking requests in motion management? |
| q14 | Rank 1 | `content/controllers.md` | 0.7375 | How do controllers and routing decorators handle HTTP requests in NestJS? |
| q15 | Rank 1 | `content/components.md` | 0.7176 | How does dependency injection work with Injectable providers in NestJS? |
| q16 | Rank 1 | `content/fundamentals/dependency-injection.md` | 0.7119 | How can I define custom providers using useValue, useClass, and useFactory in NestJS? |
| q17 | Rank 1 | `content/fundamentals/dynamic-modules.md` | 0.6879 | How do dynamic modules configure reusable NestJS modules with register or forRoot? |
| q18 | Rank 1 | `content/exception-filters.md` | 0.8011 | What are NestJS exception filters and how do you bind a custom HttpExceptionFilter? |
| q19 | Rank 1 | `content/guards.md` | 0.7615 | How do NestJS authorization guards implement CanActivate using ExecutionContext? |
| q20 | Rank 1 | `content/interceptors.md` | 0.7516 | How do NestJS interceptors wrap request and response streams with RxJS operators? |
| q21 | Rank 2 | `content/application/validation.md` | 0.6519 | How do you create a custom parameter decorator using createParamDecorator in NestJS? |
| q22 | Rank 1 | `content/fundamentals/lifecycle-events.md` | 0.6679 | In what order do NestJS lifecycle hooks like OnModuleInit and OnModuleDestroy execute? |
| q23 | Rank 1 | `content/fundamentals/provider-scopes.md` | 0.7381 | How do singleton, request-scoped, and transient provider injection scopes behave in NestJS? |
| q24 | Rank 1 | `content/fundamentals/unit-testing.md` | 0.6577 | How does NestJS Test.createTestingModule support unit testing services and controllers? |
| q25 | Rank 1 | `content/application/validation.md` | 0.6633 | How does NestJS ValidationPipe automatically transform and strip unknown DTO properties? |
