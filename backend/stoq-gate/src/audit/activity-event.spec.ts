import { activityEvent } from './activity-event';

describe('Activity descriptions from completed operations', () => {
  it('records supplies/inventory/invitations without request credentials or invite URL', () => {
    const supply = activityEvent('POST', '/supplies', { supplier: 'Поставщик', supplyNumber: 'S1', password: 'private' }, { id: 7 });
    expect(supply).toMatchObject({ action: 'create', category: 'Поставки', object: 'Поставка №7' });
    const invitation = activityEvent('POST', '/auth/admin/invitations', { role: 'WAITER' }, { id: 'private-invite', link: 'private' });
    expect(invitation).toMatchObject({ action: 'invite', category: 'Приглашения' });
    expect(JSON.stringify([supply, invitation])).not.toContain('private');
    expect(activityEvent('PUT', '/inventory', { items: [{ batchId: 2, quantity: 3 }] }, {})).toMatchObject({ title: 'Проведена инвентаризация' });
    expect(activityEvent('POST', '/inventory/2/write-off', {}, { writtenOffQuantity: 4 })).toMatchObject({ category: 'Склад' });
  });
  it('does not log reads, preview, authentication secrets or unknown routes', () => {
    for (const [method, route] of [['GET', '/orders'], ['POST', '/inventory/preview'], ['POST', '/auth/login'], ['POST', '/ai']]) {
      expect(activityEvent(method, route, {}, {})).toBeNull();
    }
  });
});
