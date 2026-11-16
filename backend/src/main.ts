import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

function loadEnvironment(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }
}

async function bootstrap(): Promise<void> {
  loadEnvironment();

  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  app.enableCors({
    origin: config.corsOrigin,
  });

  app.enableShutdownHooks();

  await app.listen(config.port);

  const logger = new Logger('Bootstrap');
  logger.log(`EngiRAG backend listening on http://localhost:${config.port}`);
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start EngiRAG backend: ${message}`);
  process.exit(1);
});
