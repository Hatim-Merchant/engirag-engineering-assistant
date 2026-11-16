import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentationSourceId } from '../src/ingestion/documentation-sources';
import { IngestionOptions, IngestionService } from '../src/ingestion/ingestion.service';

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

function parsePositiveInteger(rawValue: string, flagName: string): number {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer (received "${rawValue}")`);
  }
  return parsed;
}

function parseNonNegativeInteger(rawValue: string, flagName: string): number {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer (received "${rawValue}")`);
  }
  return parsed;
}

function parseCliArgs(argv: readonly string[]): IngestionOptions & { help?: boolean } {
  const options: IngestionOptions & { help?: boolean } = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    const [flag, inlineValue] = arg.split('=');
    const readValue = (): string => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
      }
      i += 1;
      return next;
    };

    switch (flag) {
      case '--chunk-size':
        options.chunkSizeTokens = parsePositiveInteger(readValue(), '--chunk-size');
        break;
      case '--chunk-overlap':
        options.chunkOverlapTokens = parseNonNegativeInteger(readValue(), '--chunk-overlap');
        break;
      case '--limit':
        options.limit = parsePositiveInteger(readValue(), '--limit');
        break;
      case '--source': {
        const value = readValue();
        if (value !== 'all' && value !== 'covesa_vss' && value !== 'nestjs_docs') {
          throw new Error(`--source must be one of: all, covesa_vss, nestjs_docs`);
        }
        options.source = value as DocumentationSourceId | 'all';
        break;
      }
      default:
        throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`EngiRAG Document Ingestion CLI

Usage:
  npm run ingest -- [options]

Options:
  --source=<all|covesa_vss|nestjs_docs>  Filter documentation source (default: all)
  --chunk-size=<tokens>                  Override target chunk size in tokens (default: env)
  --chunk-overlap=<tokens>               Override chunk overlap in tokens (default: env)
  --limit=<count>                        Ingest at most N documents
  --force                                Re-ingest documents even if content hash matches
  -h, --help                             Show this help message
`);
}

async function run(): Promise<void> {
  loadEnvironment();
  const parsedOptions = parseCliArgs(process.argv.slice(2));

  if (parsedOptions.help) {
    printHelp();
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const ingestionService = app.get(IngestionService);
    const report = await ingestionService.ingest({
      ...parsedOptions,
      onProgress: (message) => console.log(`[ingest] ${message}`),
    });

    console.log('\n=== Ingestion Report ===');
    console.log(`Documents fetched:            ${report.documentsFetched}`);
    console.log(`Documents processed:          ${report.documentsProcessed}`);
    console.log(`Documents skipped (unchanged):${report.documentsSkipped}`);
    console.log(`Chunks created:               ${report.chunksCreated}`);
    console.log(`Embeddings generated:         ${report.embeddingsGenerated}`);
    console.log(`Records inserted/updated:     ${report.recordsInsertedOrUpdated}`);
    console.log(`Errors encountered:           ${report.errorsEncountered.length}`);

    if (report.errorsEncountered.length > 0) {
      console.error('\nErrors:');
      for (const err of report.errorsEncountered) {
        console.error(`- [${err.stage}] ${err.sourceId}/${err.externalId}: ${err.message}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Ingestion CLI failed: ${message}`);
  process.exit(1);
});
