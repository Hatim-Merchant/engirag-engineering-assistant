import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(private readonly config: AppConfigService) {
    this.pool = new Pool({
      connectionString: this.config.databaseUrl,
    });

    this.pool.on('error', (error: Error) => {
      this.logger.error(`Unexpected PostgreSQL pool error: ${this.formatDatabaseError(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Executes a parameterized SQL query using the shared connection pool.
   */
  async query<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, [...params]);
  }

  /**
   * Runs multiple SQL operations atomically inside a database transaction.
   */
  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verifies database connectivity without throwing on transient outages.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.warn(`Database health check failed: ${this.formatDatabaseError(error)}`);
      return false;
    }
  }

  private formatDatabaseError(error: unknown): string {
    if (error instanceof AggregateError) {
      const details = error.errors
        .map((inner) => (inner instanceof Error ? inner.message : String(inner)))
        .filter(Boolean);
      return details.length > 0 ? details.join('; ') : error.name;
    }
    if (error instanceof Error) {
      return error.message || error.name;
    }
    return 'Unknown database error';
  }
}
