import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationService } from './recommendations.service';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        {
          provide: RecommendationService,
          useValue: { getStopListFromServices: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<RecommendationsController>(RecommendationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
