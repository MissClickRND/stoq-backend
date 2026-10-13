import { Test, TestingModule } from "@nestjs/testing";
import { SupplyController as SuppliesController } from "./supplies.controller";

describe("SuppliesController", () => {
  let controller: SuppliesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliesController],
    }).compile();

    controller = module.get<SuppliesController>(SuppliesController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
