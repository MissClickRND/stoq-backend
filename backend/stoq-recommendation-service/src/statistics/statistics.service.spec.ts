import { Test, TestingModule } from '@nestjs/testing';
import { StatisticsService } from './statistics.service';
import { RecommendationService } from '../recommendations/recommendations.service';

describe('StatisticsService', () => {
  let service: StatisticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StatisticsService, { provide: RecommendationService, useValue: { getDishStatusesFromServices: jest.fn() } }],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
