import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/app-config.service';
import {
  AggregatedMetrics,
  EvaluationQuestion,
  QuestionRetrievalOutcome,
  computeMetricsAtK,
  evaluateQuestionOutcome,
  normalizeExpectedSources,
} from '../src/evaluation/evaluation-metrics';
import { DOCUMENTATION_SOURCES } from '../src/ingestion/documentation-sources';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { RetrievalService } from '../src/retrieval/retrieval.service';

// Evaluate 500 last so PostgreSQL finishes with the default 500-token chunks indexed.
const EXPERIMENT_RUN_ORDER = [300, 800, 500] as const;
const REPORT_CHUNK_ORDER = [300, 500, 800] as const;
const K_VALUES = [3, 5, 8] as const;
const OVERLAP_TOKENS = 75;

interface ChunkSizeExperimentResult {
  chunkSizeTokens: number;
  chunkOverlapTokens: number;
  documentsProcessed: number;
  totalChunksCreated: number;
  ingestionDurationMs: number;
  metricsByK: AggregatedMetrics[];
  outcomes: QuestionRetrievalOutcome[];
}

function loadEnvironment(): void {
  const candidatePaths = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }
}

function loadQuestions(questionsPath: string): EvaluationQuestion[] {
  const rawJson = fs.readFileSync(questionsPath, 'utf-8');
  const parsed = JSON.parse(rawJson) as EvaluationQuestion[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Evaluation dataset at ${questionsPath} must be a non-empty JSON array`);
  }

  const validSourceIds = new Set(DOCUMENTATION_SOURCES.map((entry) => entry.externalId));
  for (const item of parsed) {
    for (const source of normalizeExpectedSources(item.expectedSource)) {
      if (!validSourceIds.has(source)) {
        throw new Error(
          `Question ${item.id} references unknown expectedSource "${source}" not present in DOCUMENTATION_SOURCES`,
        );
      }
    }
  }

  return parsed;
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function buildMarkdownReport(options: {
  generatedAt: string;
  embeddingModel: string;
  totalQuestions: number;
  totalDocuments: number;
  experiments: readonly ChunkSizeExperimentResult[];
}): string {
  const { generatedAt, embeddingModel, totalQuestions, totalDocuments, experiments } = options;

  const lines: string[] = [
    '# EngiRAG Retrieval Evaluation Report',
    '',
    `- **Generated at**: ${generatedAt}`,
    `- **Corpus**: ${totalDocuments} public Markdown documents (20 COVESA VSS + 16 NestJS)`,
    `- **Evaluation dataset**: ${totalQuestions} technical questions (\`evaluation/questions.json\`)`,
    `- **Embedding model**: \`${embeddingModel}\` (local CPU, 384 dimensions)`,
    `- **Retrieval configuration**: PostgreSQL \`pgvector\` cosine similarity (\`1 - (embedding <=> query)\`), \`minScore = 0\` across top-8 candidates so \`Hit@3\`, \`Hit@5\`, and \`Hit@8\` measure pure ranking quality`,
    `- **Overlap**: ${OVERLAP_TOKENS} tokens`,
    '',
    '## Corpus Chunking Summary',
    '',
    '| Chunk Size | Overlap | Documents Indexed | Total Chunks | Ingestion Time (s) |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const exp of experiments) {
    lines.push(
      `| ${exp.chunkSizeTokens} tokens | ${exp.chunkOverlapTokens} tokens | ${exp.documentsProcessed} | ${exp.totalChunksCreated} | ${(exp.ingestionDurationMs / 1000).toFixed(2)}s |`,
    );
  }

  lines.push(
    '',
    '## Retrieval Metrics Comparison (Hit@k & MRR)',
    '',
    '| Chunk Size | Top-k | Hits | Hit@k | MRR | Section Hit@k |',
    '| --- | --- | --- | --- | --- | --- |',
  );

  let bestMrr5: { chunkSize: number; mrr: number; hit: number } | null = null;

  for (const exp of experiments) {
    for (const metrics of exp.metricsByK) {
      const sectionLabel =
        metrics.sectionHitRateAtK !== null
          ? `${metrics.sectionHitsAtK}/${metrics.questionsWithExpectedSection} (${formatPercent(metrics.sectionHitRateAtK)})`
          : 'N/A';

      lines.push(
        `| ${exp.chunkSizeTokens} tokens | ${metrics.k} | ${metrics.hitsAtK}/${metrics.totalQuestions} | ${metrics.hitRateAtK.toFixed(4)} (${formatPercent(metrics.hitRateAtK)}) | ${metrics.mrrAtK.toFixed(4)} | ${sectionLabel} |`,
      );

      if (metrics.k === 5 && (!bestMrr5 || metrics.mrrAtK > bestMrr5.mrr)) {
        bestMrr5 = {
          chunkSize: exp.chunkSizeTokens,
          mrr: metrics.mrrAtK,
          hit: metrics.hitRateAtK,
        };
      }
    }
  }

  lines.push(
    '',
    '## Analysis & Trade-offs',
    '',
    bestMrr5
      ? `- **Observed Top-5 Winner**: \`${bestMrr5.chunkSize}\`-token chunking achieved the highest MRR@5 (**${bestMrr5.mrr.toFixed(4)}**) with **${formatPercent(bestMrr5.hit)}** Hit@5 across the ${totalQuestions} questions.`
      : '- No experiments recorded.',
    '- **Smaller chunks (300 tokens)** create more granular vectors (higher chunk count) so individual concepts do not compete inside one embedding, at the cost of occasionally separating an explanation from a following code snippet.',
    '- **Larger chunks (800 tokens)** keep wider section context together, but because `Xenova/all-MiniLM-L6-v2` truncates inputs beyond ~256 WordPiece tokens, details located late in an 800-token chunk contribute less to the pooled vector.',
    '- **Default 500 tokens** balances vector specificity and coherent multi-paragraph context while keeping retrieved LLM prompts concise.',
    '',
    '## What Hit@k and MRR Measure (and Do Not Measure)',
    '',
    '- **Hit@k** measures recall in the top-k results: the fraction of questions where at least one chunk from the expected source page appears within ranks `1..k`.',
    '- **MRR (Mean Reciprocal Rank)** measures ranking precision for the *first* relevant source page (`1 / rank` of the first matching chunk, `0` if absent within top-k), rewarding configurations that place the right document at rank `1` rather than rank `5`.',
    '- **What they do NOT measure**: Neither metric measures downstream LLM answer correctness, faithfulness, citation accuracy, latency, or whether the retrieved passage contains the exact line needed to answer a nuanced multi-hop question.',
    '',
    '## Per-Question Diagnostics (500-token chunks, k = 5)',
    '',
  );

  const baselineExp = experiments.find((exp) => exp.chunkSizeTokens === 500);
  if (baselineExp) {
    lines.push('| ID | First Relevant Rank | Top Retrieved Source | Score | Question |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const outcome of baselineExp.outcomes) {
      const rankLabel =
        outcome.firstRelevantRank !== null && outcome.firstRelevantRank <= 5
          ? `Rank ${outcome.firstRelevantRank}`
          : outcome.firstRelevantRank !== null
            ? `Rank ${outcome.firstRelevantRank} (>5)`
            : 'Miss';
      const top = outcome.retrievedSources[0];
      const topLabel = top ? `\`${top.externalId}\`` : 'None';
      const topScore = top ? top.score.toFixed(4) : '0.0000';
      lines.push(
        `| ${outcome.questionId} | ${rankLabel} | ${topLabel} | ${topScore} | ${outcome.question} |`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

async function runEvaluation(): Promise<void> {
  loadEnvironment();

  const repoRoot = path.resolve(__dirname, '../..');
  const questionsPath = path.join(repoRoot, 'evaluation', 'questions.json');
  const resultsDir = path.join(repoRoot, 'evaluation', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });

  const questions = loadQuestions(questionsPath);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const config = app.get(AppConfigService);
    const ingestionService = app.get(IngestionService);
    const retrievalService = app.get(RetrievalService);

    const maxK = Math.max(...K_VALUES);
    const resultsByChunkSize = new Map<number, ChunkSizeExperimentResult>();

    for (const chunkSizeTokens of EXPERIMENT_RUN_ORDER) {
      console.log(
        `\n--- Running experiment: chunkSize=${chunkSizeTokens}, overlap=${OVERLAP_TOKENS} ---`,
      );
      const startedAt = Date.now();

      const ingestReport = await ingestionService.ingest({
        chunkSizeTokens,
        chunkOverlapTokens: OVERLAP_TOKENS,
        force: true,
      });

      if (ingestReport.errorsEncountered.length > 0) {
        throw new Error(
          `Ingestion encountered ${ingestReport.errorsEncountered.length} errors during chunkSize=${chunkSizeTokens}`,
        );
      }

      const outcomes: QuestionRetrievalOutcome[] = [];
      for (const question of questions) {
        const retrieved = await retrievalService.retrieve(question.question, {
          topK: maxK,
          minScore: 0,
        });

        outcomes.push(
          evaluateQuestionOutcome(
            question,
            retrieved.map((chunk) => ({
              externalId: chunk.externalId,
              sectionHeading: chunk.sectionHeading,
              score: chunk.score,
            })),
          ),
        );
      }

      const metricsByK = K_VALUES.map((k) => computeMetricsAtK(outcomes, k));
      const ingestionDurationMs = Date.now() - startedAt;

      resultsByChunkSize.set(chunkSizeTokens, {
        chunkSizeTokens,
        chunkOverlapTokens: OVERLAP_TOKENS,
        documentsProcessed: ingestReport.documentsProcessed,
        totalChunksCreated: ingestReport.chunksCreated,
        ingestionDurationMs,
        metricsByK,
        outcomes,
      });

      for (const metrics of metricsByK) {
        console.log(
          `chunk=${chunkSizeTokens} | k=${metrics.k} | Hit@${metrics.k}=${metrics.hitRateAtK.toFixed(4)} (${metrics.hitsAtK}/${metrics.totalQuestions}) | MRR=${metrics.mrrAtK.toFixed(4)}`,
        );
      }
    }

    const orderedExperiments = REPORT_CHUNK_ORDER.map((size) => {
      const exp = resultsByChunkSize.get(size);
      if (!exp) {
        throw new Error(`Missing experiment result for chunk size ${size}`);
      }
      return exp;
    });

    const generatedAt = new Date().toISOString();
    const markdownReport = buildMarkdownReport({
      generatedAt,
      embeddingModel: config.embeddingModel,
      totalQuestions: questions.length,
      totalDocuments: DOCUMENTATION_SOURCES.length,
      experiments: orderedExperiments,
    });

    const jsonPath = path.join(resultsDir, 'retrieval-evaluation.json');
    const mdPath = path.join(resultsDir, 'retrieval-evaluation.md');

    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generatedAt,
          embeddingModel: config.embeddingModel,
          totalQuestions: questions.length,
          totalDocuments: DOCUMENTATION_SOURCES.length,
          experiments: orderedExperiments,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(mdPath, markdownReport);

    console.log(`\nSaved JSON results to: ${jsonPath}`);
    console.log(`Saved Markdown report to: ${mdPath}`);
  } finally {
    await app.close();
  }
}

runEvaluation().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Evaluation failed: ${message}`);
  process.exit(1);
});
