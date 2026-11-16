import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let isHealthyMock: jest.Mock<Promise<boolean>, []>;

  beforeEach(async () => {
    isHealthyMock = jest.fn<Promise<boolean>, []>();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: DatabaseService,
          useValue: {
            isHealthy: isHealthyMock,
          },
        },
      ],
    }).compile();

    controller = moduleRef.get<HealthController>(HealthController);
  });

  it('returns ok status and connected database when PostgreSQL responds', async () => {
    isHealthyMock.mockResolvedValueOnce(true);

    const response = await controller.getHealth();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('engirag-backend');
    expect(response.database).toBe('connected');
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
    expect(isHealthyMock).toHaveBeenCalledTimes(1);
  });

  it('returns degraded status and disconnected database when PostgreSQL is unreachable', async () => {
    isHealthyMock.mockResolvedValueOnce(false);

    const response = await controller.getHealth();

    expect(response.status).toBe('degraded');
    expect(response.service).toBe('engirag-backend');
    expect(response.database).toBe('disconnected');
    expect(isHealthyMock).toHaveBeenCalledTimes(1);
  });
});
