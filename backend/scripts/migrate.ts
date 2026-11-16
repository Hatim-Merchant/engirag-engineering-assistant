import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import { validateEnv } from '../src/config/env.schema';

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

async function runMigrations(): Promise<void> {
  loadEnvironment();
  const config = validateEnv(process.env);

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
  });

  const migrationsDir = path.resolve(__dirname, '../migrations');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const appliedResult = await pool.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename ASC',
    );
    const appliedFiles = new Set(appliedResult.rows.map((row) => row.filename));

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      console.log('No SQL migration files found.');
      return;
    }

    for (const filename of migrationFiles) {
      if (appliedFiles.has(filename)) {
        console.log(`Skipping already applied migration: ${filename}`);
        continue;
      }

      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, 'utf-8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`Applied migration: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration failed: ${message}`);
  process.exit(1);
});
