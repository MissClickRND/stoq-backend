import { RecommendationService } from "./recommendations.service";
import { CommandBusService } from "../common/rabbitMQ/command-bus.service";
import {
  DishData,
  ProductStock,
  RecommendationBatch,
} from "./types/recommendation.types";

describe("RecommendationService", () => {
  let service: RecommendationService;

  beforeEach(() => {
    service = new RecommendationService({} as CommandBusService);
  });

  it("должен правильно рассчитывать количество порций", () => {
    const dishes: DishData[] = [
      {
        id: 1,
        name: "Картофельное пюре",
        salePrice: 200,
        recipeItems: [
          {
            productId: 1,
            productName: "Картофель",
            quantityPerPortion: 300,
          },
          {
            productId: 2,
            productName: "Молоко",
            quantityPerPortion: 100,
          },
        ],
      },
    ];

    const stocks: ProductStock[] = [
      {
        productId: 1,
        availableQuantity: 1200,
        expiredQuantity: 0,
      },
      {
        productId: 2,
        availableQuantity: 200,
        expiredQuantity: 0,
      },
    ];

    const result = service.calculateRecommendations(dishes, stocks);

    expect(result).toHaveLength(1);
    expect(result[0].maxPortions).toBe(2);
    expect(result[0].status).toBe("LOW_STOCK");
    expect(result[0].reasons).toEqual([]);
  });

  it("должен добавлять блюдо в стоп-лист, если продукта не хватает", () => {
    const dishes: DishData[] = [
      {
        id: 2,
        name: "Бефстроганов",
        salePrice: 450,
        recipeItems: [
          {
            productId: 1,
            productName: "Говядина",
            quantityPerPortion: 200,
          },
        ],
      },
    ];

    const stocks: ProductStock[] = [
      {
        productId: 1,
        availableQuantity: 100,
        expiredQuantity: 0,
      },
    ];

    const result = service.calculateRecommendations(dishes, stocks);

    expect(result[0].maxPortions).toBe(0);
    expect(result[0].status).toBe("STOP_LIST");
    expect(result[0].reasons).toEqual([
      { status: "INSUFFICIENT_STOCK", name: "Говядина" },
    ]);
  });

  it("должен добавлять блюдо в стоп-лист, если данных о продукте нет", () => {
    const dishes: DishData[] = [
      {
        id: 3,
        name: "Омлет",
        salePrice: 180,
        recipeItems: [
          {
            productId: 10,
            productName: "Яйца",
            quantityPerPortion: 2,
          },
        ],
      },
    ];

    const result = service.calculateRecommendations(dishes, []);

    expect(result[0].status).toBe("STOP_LIST");
    expect(result[0].reasons).toEqual([
      { status: "INSUFFICIENT_STOCK", name: "Яйца" },
    ]);
  });

  it("должен считать блюдо без рецепта недоступным", () => {
    const dishes: DishData[] = [
      {
        id: 4,
        name: "Новое блюдо",
        salePrice: 300,
        recipeItems: [],
      },
    ];

    const result = service.calculateRecommendations(dishes, []);

    expect(result[0].status).toBe("STOP_LIST");
    expect(result[0].reasons).toEqual([]);
  });

  it("добавляет причину просроченного ингредиента только при отсутствии годного остатка", () => {
    const result = service.calculateRecommendations(
      [
        {
          id: 6,
          name: "Сырный соус",
          salePrice: 180,
          recipeItems: [
            {
              productId: 15,
              productName: "Сыр",
              quantityPerPortion: 100,
            },
          ],
        },
      ],
      [
        {
          productId: 15,
          availableQuantity: 0,
          expiredQuantity: 50,
        },
      ],
    );

    expect(result[0].reasons).toEqual([
      { status: "INSUFFICIENT_STOCK", name: "Сыр" },
      { status: "EXPIRED_INGREDIENT", name: "Сыр" },
    ]);
  });

  it("запрашивает Catalog и Inventory через RabbitMQ и суммирует партии продукта", async () => {
    const commandBus = {
      sendCommand: jest
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              id: 5,
              name: "Суп",
              salePrice: 250,
              recipeItems: [
                {
                  productId: 12,
                  quantity: 400,
                  product: { name: "Бульон" },
                },
              ],
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              productId: 12,
              expiresAt: "2099-01-01T00:00:00.000Z",
              balance: { availableQuantity: 120 },
            },
            {
              productId: 12,
              expiresAt: "2099-01-01T00:00:00.000Z",
              balance: { availableQuantity: 180 },
            },
          ],
        }),
    } as unknown as CommandBusService;
    service = new RecommendationService(commandBus);

    const result = await service.getStopListFromServices();

    expect(commandBus.sendCommand).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      expect.objectContaining({
        dishId: 5,
        maxPortions: 0,
        status: "STOP_LIST",
      }),
    ]);
  });

  it("строит рекомендации из текущих данных Catalog и Inventory", async () => {
    const commandBus = {
      sendCommand: jest
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              id: 7,
              name: "Крем-суп",
              salePrice: 300,
              recipeItems: [
                {
                  productId: 20,
                  quantity: 2,
                  product: { name: "Сливки" },
                },
              ],
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              productId: 20,
              availableQuantity: 6,
              price: 25,
              expiresAt: "2099-01-01T00:00:00.000Z",
              status: "ACTIVE",
            },
          ],
        }),
    } as unknown as CommandBusService;
    service = new RecommendationService(commandBus);

    await expect(service.getDishRecommendationsFromServices()).resolves.toEqual(
      [
        expect.objectContaining({
          dishId: 7,
          costPrice: 50,
          profit: 250,
          maxPortions: 3,
        }),
      ],
    );
  });
});
