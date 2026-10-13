import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CommandBusService } from '../../common/rabbitMQ/command-bus.service';

describe('GET /analytics/graph', () => {
  let app: any;
  const sendCommand = jest.fn();
  beforeAll(async () => {
    expect(
      require('node:fs').existsSync(
        require('node:path').join(__dirname, 'dependency-graph.controller.ts'),
      ),
    ).toBe(true);
    const {
      DependencyGraphController,
    } = require('./dependency-graph.controller');
    const { DependencyGraphService } = require('./dependency-graph.service');
    const module = await Test.createTestingModule({
      controllers: [DependencyGraphController],
      providers: [
        DependencyGraphService,
        { provide: CommandBusService, useValue: { sendCommand } },
        { provide: ConfigService, useValue: new ConfigService() },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });
  afterAll(() => app?.close());
  beforeEach(() => sendCommand.mockReset());
  it('proxies the graph from recommendation without recalculating server statuses', async () => {
    sendCommand.mockResolvedValue({
      success: true,
      data: {
        nodes: [
          { id: 'product:2', type: 'ingredient', data: { name: 'Базилик', quantity: 0.05, unit: 'кг', status: 'low_stock' } },
          { id: 'dish:11', type: 'dish', data: { name: 'Паста', status: 'low_stock' } },
        ],
        edges: [{ id: 'recipe:2', source: 'product:2', target: 'dish:11', data: { required: 0.01, unit: 'кг', status: 'low_stock' } }],
      },
    });
    await request(app.getHttpServer())
      .get('/analytics/graph')
      .expect(200, {
        nodes: [
          {
            id: 'product:2',
            type: 'ingredient',
            data: {
              name: 'Базилик',
              quantity: 0.05,
              unit: 'кг',
              status: 'low_stock',
            },
          },
          {
            id: 'dish:11',
            type: 'dish',
            data: { name: 'Паста', status: 'low_stock' },
          },
        ],
        edges: [
          {
            id: 'recipe:2',
            source: 'product:2',
            target: 'dish:11',
            data: { required: 0.01, unit: 'кг', status: 'low_stock' },
          },
        ],
      });
    expect(sendCommand).toHaveBeenCalledWith(
      'app.commands',
      'command.recommendation.get_dependency_graph',
      {},
    );
  });
  it('returns empty arrays for an empty catalog', async () => {
    sendCommand.mockResolvedValue({ success: true, data: { nodes: [], edges: [] } });
    await request(app.getHttpServer())
      .get('/analytics/graph')
      .expect(200, { nodes: [], edges: [] });
  });
  it('removes the old HTTP route', async () => {
    await request(app.getHttpServer()).get('/analytics/dependencies').expect(404);
    expect(sendCommand).not.toHaveBeenCalled();
  });
  it('documents both node types, statuses and numeric edge requirements in Swagger', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas: any = doc.components?.schemas;
    expect(
      schemas.DependencyGraphResponseDto.properties.nodes.items.oneOf,
    ).toHaveLength(2);
    expect(schemas.IngredientGraphDataDto.properties.status.enum).toEqual([
      'available',
      'low_stock',
      'out_of_stock',
    ]);
    expect(schemas.RecipeGraphDataDto.properties.required.type).toBe('number');
    expect(
      doc.paths['/analytics/graph'].get?.responses['200'],
    ).toBeDefined();
  });
  it('preserves catalog errors, rejects malformed success and hides broker details', async () => {
    sendCommand.mockResolvedValue({
      success: false,
      error: { status: 503, message: 'Склад недоступен' },
    });
    await request(app.getHttpServer())
      .get('/analytics/graph')
      .expect(503);
    sendCommand.mockResolvedValue({ success: true, data: {} });
    await request(app.getHttpServer())
      .get('/analytics/graph')
      .expect(502);
    sendCommand.mockRejectedValue(new Error('amqp://private-password@host'));
    const response = await request(app.getHttpServer())
      .get('/analytics/graph')
      .expect(503);
    expect(JSON.stringify(response.body)).not.toContain('private-password');
  });
});
