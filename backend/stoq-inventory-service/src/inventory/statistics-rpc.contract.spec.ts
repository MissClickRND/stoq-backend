import { InventoryRPCController } from './inventory-rpc.controller';
import { SupplyRPCController } from '../supplies/supplies-rpc.controller';
import { NotFoundException } from '@nestjs/common';
import { ROUTING_KEYS } from '../common/rabbitMQ/rabbitmq-topology';

describe('statistics RPC contracts', () => {
  it('keeps the existing RPC envelope and forwards inventory preview DTOs', async () => {
    const dto = { includeReport: true, items: [{ batchId: 1, quantity: 0, remove: true }] };
    const service: any = { getStatistics: jest.fn(async () => ({ totalProducts: 1 })), getWriteOffs: jest.fn(async () => []),
      preview: jest.fn(async () => ({ checked: 1, updated: 0, deleted: 1, unchanged: 0 })) };
    const rpc: any = new InventoryRPCController(service);
    expect(await rpc.statistics()).toEqual({ success: true, data: { totalProducts: 1 } });
    expect(await rpc.writeOffs()).toEqual({ success: true, data: [] });
    expect(await rpc.preview({ dto })).toMatchObject({ success: true, data: { deleted: 1 } });
    expect(service.preview).toHaveBeenCalledWith(dto);
  });
  it('keeps missing supply detail as a 404 RPC error', async () => {
    const service: any = { getStatistics: jest.fn(async () => { throw new NotFoundException('Поставка не найдена'); }) };
    const rpc: any = new SupplyRPCController(service);
    expect(await rpc.statistics({ id: 19 })).toMatchObject({ success: false, error: { status: 404 } });
    expect(service.getStatistics).toHaveBeenCalledWith(19);
  });
  it('uses the four agreed business command keys', () => {
    expect(ROUTING_KEYS).toMatchObject({ GET_INVENTORY_STATISTICS: 'command.inventory.get_statistics',
      GET_INVENTORY_WRITE_OFFS: 'command.inventory.get_write_offs', PREVIEW_INVENTORY: 'command.inventory.preview',
      GET_SUPPLY_STATISTICS: 'command.inventory.get_supply_statistics' });
  });
});
