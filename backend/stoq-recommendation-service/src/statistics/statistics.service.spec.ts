import { Test, TestingModule } from "@nestjs/testing";
import { StatisticsService } from "./statistics.service";
import { RecommendationService } from "../recommendations/recommendations.service";
import { CommandBusService } from "src/common/rabbitMQ/command-bus.service";
import { EXCHANGES, ROUTING_KEYS } from "src/common/rabbitMQ/rabbitmq-topology";

describe("StatisticsService", () => {
  let service: StatisticsService;
  let commandBus: { sendCommand: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticsService,
        {
          provide: RecommendationService,
          useValue: { getDishStatusesFromServices: jest.fn() },
        },
        { provide: CommandBusService, useValue: { sendCommand: jest.fn() } },
      ],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);
    commandBus = module.get(CommandBusService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("gets today order statistics through RabbitMQ", async () => {
    const statistics = {
      total: 3,
      completed: 2,
      cancelled: 1,
      revenue: "1200.00",
      active: 0,
    };
    commandBus.sendCommand.mockResolvedValue({
      success: true,
      data: statistics,
    });

    await expect(service.getOrdersTodayStatistics()).resolves.toEqual(
      statistics,
    );
    expect(commandBus.sendCommand).toHaveBeenCalledWith(
      EXCHANGES.COMMANDS,
      ROUTING_KEYS.GET_ORDERS_TODAY_STATISTICS,
      {},
    );
  });
});
