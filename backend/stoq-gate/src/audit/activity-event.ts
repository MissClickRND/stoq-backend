export interface ActivityDescription { action: string; category: string; title: string; description: string; object?: string; detail?: string }

export function activityEvent(method: string, path: string, body: any, result: any): ActivityDescription | null {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  const id = result?.id ?? path.match(/\/(\d+)(?:\/|$)/)?.[1];
  const action = method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
  const event = (category: string, title: string, object?: string, detail?: string): ActivityDescription => ({ action, category, title, description: title + '.', object, detail });
  if (/^\/supplies(?:\/\d+)?$/.test(path)) {
    return event('Поставки', method === 'POST' ? 'Создана поставка' : method === 'DELETE' ? 'Отменена поставка' : 'Обновлена поставка', `Поставка №${id ?? '—'}`,
      typeof body?.supplier === 'string' ? `Поставщик: ${body.supplier.slice(0, 200)}` : undefined);
  }
  if (path === '/inventory' && method === 'PUT') return event('Склад', 'Проведена инвентаризация', `Проверено партий: ${Array.isArray(body?.items) ? body.items.length : 0}`);
  if (/^\/inventory\/write-offs\/\d+$/.test(path) && method === 'DELETE') return result?.alreadyDisposed ? null : event('Склад', 'Утилизирована просроченная партия', `Партия №${id}`);
  if (/^\/inventory\/\d+\/write-off$/.test(path)) return result?.writtenOffQuantity === 0 ? null : event('Склад', 'Списаны продукты', `Партия №${id}`, typeof result?.writtenOffQuantity === 'number' ? `Списанное количество: ${result.writtenOffQuantity}` : undefined);
  if (path === '/auth/admin/invitations' && method === 'POST') return { ...event('Приглашения', 'Создано приглашение сотрудника'), action: 'invite' };
  if (/^\/auth\/admin\/invitations\/[^/]+(?:\/revoke)?$/.test(path)) return event('Приглашения', method === 'DELETE' ? 'Удалено приглашение сотрудника' : 'Отозвано приглашение сотрудника');
  if (/^\/auth\/admin\/users\/\d+\/role$/.test(path)) return { ...event('Сотрудники', 'Изменена роль сотрудника', `Сотрудник №${id}`, typeof body?.role === 'string' ? `Новая роль: ${body.role}` : undefined), action: 'role' };
  if (/^\/auth\/admin\/users\/\d+\/block$/.test(path)) return event('Сотрудники', body?.blocked ? 'Сотрудник заблокирован' : 'Сотрудник разблокирован', `Сотрудник №${id}`);
  if (/^\/auth\/.*approve/.test(path)) return event('Сотрудники', 'Подтверждён доступ сотрудника', `Сотрудник №${id ?? body?.userId ?? '—'}`);
  if (path === '/auth/register-user') return event('Сотрудники', 'Зарегистрирован сотрудник', `Сотрудник №${result?.user?.id ?? '—'}`);
  if (path === '/auth/register-restaurant') return event('Заведение', 'Зарегистрирован ресторан', `Ресторан №${result?.restaurant?.id ?? '—'}`);
  if (/^\/auth\/admin\/users\/\d+$/.test(path) && method === 'DELETE') return event('Сотрудники', 'Удалён сотрудник', `Сотрудник №${id}`);
  if (path === '/auth/admin/restaurant' || path === '/auth/restaurant') return event('Заведение', 'Обновлены настройки ресторана');
  if (/^\/orders(?:\/\d+(?:\/status)?)?$/.test(path)) return event('Заказы', method === 'POST' ? 'Создан заказ' : method === 'DELETE' ? 'Удалён заказ' : 'Изменён статус заказа', `Заказ №${id ?? '—'}`, typeof body?.status === 'string' ? `Статус: ${body.status}` : undefined);
  if (/^\/dishes(?:\/\d+|\/batch)?$/.test(path)) return event('Блюда', path.endsWith('/batch') ? 'Созданы блюда' : method === 'POST' ? 'Создано блюдо' : method === 'DELETE' ? 'Удалено блюдо' : 'Обновлено блюдо', id ? `Блюдо №${id}` : undefined);
  if (/^\/product(?:\/\d+|\/few|\/units)?$/.test(path)) return event('Каталог', path.endsWith('/units') ? 'Создана единица измерения' : method === 'DELETE' ? 'Удалён продукт' : method === 'POST' ? 'Создан продукт' : 'Обновлён продукт', id ? `Позиция №${id}` : undefined);
  if (path === '/test/restaurant') return event('Заведение', 'Создан отдельный демо-ресторан');
  return null;
}
