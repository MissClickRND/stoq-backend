import { Test, TestingModule } from "@nestjs/testing";
import { StatisticsController } from "./statistics.controller";
import { StatisticsService } from "./statistics.service";

describe("StatisticsController", () => {
  let controller: StatisticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatisticsController],
      providers: [
        {
          provide: StatisticsService,
          useValue: {
            getDishesStatistics: jest.fn(),
            getOrdersTodayStatistics: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<StatisticsController>(StatisticsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
