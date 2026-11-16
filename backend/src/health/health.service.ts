import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  service: 'engirag-backend';
  timestamp: string;
  database: 'connected' | 'disconnected';
}

@Injectable()
export class HealthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async check(): Promise<HealthCheckResponse> {
    const dbConnected = await this.databaseService.isHealthy();

    return {
      status: dbConnected ? 'ok' : 'degraded',
      service: 'engirag-backend',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
    };
  }
}
