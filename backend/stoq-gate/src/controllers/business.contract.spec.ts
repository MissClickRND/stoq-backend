import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { SupplyController } from './inventory/supplies/supplies.controller';
import { InventoryController } from './inventory/inventory/inventory.controller';
import { DishesController } from './catalog/dishes/dishes.controller';
import { OrderController } from './order/order.controller';
import { CommandBusService } from '../common/rabbitMQ/command-bus.service';

describe('Gateway business POST / GET contracts', () => {
  let app: any;
  const sendCommand = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        SupplyController,
        InventoryController,
        DishesController,
        OrderController,
      ],
      providers: [{ provide: CommandBusService, useValue: { sendCommand } }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => sendCommand.mockReset());
  it.each(['create', 'addItems', 'changeStatus'])('returns stock error products over HTTP for %s', async (operation) => {
    const error = { status: 400, message: 'Недостаточно товаров', products: [{ productId: 7, name: 'Молоко' }] };
    sendCommand.mockResolvedValue({ success: false, error });
    const server = app.getHttpServer();
    const call = operation === 'changeStatus'
      ? request(server).patch('/orders/9/status').send({ status: 'completed' })
      : request(server).post(operation === 'create' ? '/orders' : '/orders/9/items')
          .send({ items: [{ dishId: 1, quantity: 1 }] });
    await call.expect(400, { statusCode: 400, message: error.message, products: error.products });
  });
  it('supply POST preserves supplier and line total; both GETs preserve total and supplier', async () => {
    const response = {
      id: 1,
      supplier: 'ABC',
      totalPrice: 300,
      items: [{ totalPrice: 300, price: 100, quantity: 3 }],
    };
    sendCommand.mockResolvedValue({ success: true, data: response });
    await request(app.getHttpServer())
      .post('/supplies')
      .send({
        supplyNumber: 'S1',
        supplier: 'ABC',
        items: [
          {
            productId: 1,
            quantity: 3,
            totalPrice: 300,
            expiresAt: '2030-01-01T00:00:00Z',
          },
        ],
      })
      .expect(201, response);
    expect(sendCommand.mock.calls[0][2].dto).toMatchObject({
      supplier: 'ABC',
      items: [{ totalPrice: 300 }],
    });
    await request(app.getHttpServer()).get('/supplies/1').expect(200, response);
    sendCommand.mockResolvedValue({ success: true, data: [response] });
    await request(app.getHttpServer()).get('/supplies').expect(200, [response]);
  });
  it('rejects missing supplier, missing line price and zero quantities before RPC', async () => {
    const valid = {
      supplyNumber: 'S1',
      supplier: 'ABC',
      items: [
        {
          productId: 1,
          quantity: 3,
          totalPrice: 300,
          expiresAt: '2030-01-01T00:00:00Z',
        },
      ],
    };
    for (const data of [
      { ...valid, supplier: '' },
      { ...valid, items: [{ ...valid.items[0], totalPrice: undefined }] },
      { ...valid, items: [{ ...valid.items[0], quantity: 0 }] },
    ])
      await request(app.getHttpServer())
        .post('/supplies')
        .send(data)
        .expect(400);
    expect(sendCommand).not.toHaveBeenCalled();
  });
  it('dish POST accepts category and fractional ingredient quantities; GETs return stock pricing', async () => {
    const dish = {
      id: 1,
      category: 'Салаты',
      availablePortions: 4,
      recipeItems: [{ price: 100, stock: 2, portions: 4 }],
    };
    sendCommand.mockResolvedValue({ success: true, data: dish });
    await request(app.getHttpServer())
      .post('/dishes')
      .send({
        name: 'Салат',
        category: 'Салаты',
        salePrice: 300,
        recipeItems: [{ productId: 1, quantity: 0.5 }],
      })
      .expect(201, dish);
    expect(sendCommand.mock.calls[0][2].dto.category).toBe('Салаты');
    await request(app.getHttpServer()).get('/dishes/1').expect(200, dish);
    sendCommand.mockResolvedValue({ success: true, data: [dish] });
    await request(app.getHttpServer()).get('/dishes').expect(200, [dish]);
  });
  it('order POST preserves ISO metadata; list and detail GET preserve all fields', async () => {
    const body = {
      date: '2026-10-13T12:30:00Z',
      type: 'dine-in',
      table: 3,
      guests: 4,
      items: [{ dishId: 1, quantity: 2 }],
    };
    const order = {
      id: 1,
      ...body,
      totalPrice: 600,
      items: [
        { dishId: 1, quantity: 2, name: 'Салат', price: 300, totalPrice: 600 },
      ],
    };
    sendCommand.mockResolvedValue({ success: true, data: order });
    await request(app.getHttpServer())
      .post('/orders')
      .send(body)
      .expect(201, order);
    expect(sendCommand.mock.calls[0][2].dto).toEqual(body);
    await request(app.getHttpServer()).get('/orders/1').expect(200, order);
    sendCommand.mockResolvedValue({ success: true, data: [order] });
    await request(app.getHttpServer()).get('/orders').expect(200, [order]);
  });
  it('inventory GET keeps separate batches and their prices', async () => {
    const rows = [
      { id: 1, productId: 1, price: 100 },
      { id: 2, productId: 1, price: 120 },
    ];
    sendCommand.mockResolvedValue({ success: true, data: rows });
    await request(app.getHttpServer()).get('/inventory').expect(200, rows);
    await request(app.getHttpServer()).get('/inventory/1').expect(200, rows);
  });
  it('Swagger describes all added request and response fields', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas: any = doc.components?.schemas;
    for (const [name, fields] of [
      ['SupplyResponseDto', ['supplier', 'totalPrice']],
      ['SupplyItemResponseDto', ['price', 'totalPrice']],
      ['InventoryResponseDto', ['price', 'totalPrice']],
      ['DishResponseDto', ['category', 'availablePortions']],
      ['RecipeItemResponseDto', ['price', 'stock', 'portions']],
      ['OrderResponseDto', ['date', 'type', 'table', 'guests', 'totalPrice']],
      ['OrderItemResponseDto', ['name', 'price', 'totalPrice']],
      ['CreateSupplyDto', ['supplier']],
      ['CreateSupplyItemDto', ['totalPrice']],
      ['CreateDishDto', ['category']],
      ['CreateOrderDto', ['date', 'type', 'table', 'guests']],
    ] as [string, string[]][])
      for (const field of fields)
        expect(schemas[name].properties[field]).toBeDefined();
  });
});
