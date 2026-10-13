import { UnprocessableEntityException } from '@nestjs/common';

export type UpdProductRow = {
  name: string | null;
  unit: string | null;
  quantity: number | null;
  price: number | null;
  totalPrice: number | null;
};

export const normalizeProductName = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru').replace(/ё/g, 'е');

const units = [
  { name: 'Штука', shortName: 'шт', aliases: ['шт', 'штука', 'штук', 'штуки', 'штуках', 'штуч'] },
  { name: 'Килограмм', shortName: 'кг', aliases: ['кг', 'килограмм', 'килограммы', 'килограммов', 'kg'] },
  { name: 'Грамм', shortName: 'г', aliases: ['г', 'гр', 'грамм', 'граммы', 'граммов', 'g'] },
  { name: 'Литр', shortName: 'л', aliases: ['л', 'литр', 'литры', 'литров', 'l'] },
  { name: 'Миллилитр', shortName: 'мл', aliases: ['мл', 'миллилитр', 'миллилитры', 'миллилитров', 'ml'] },
];

export function updUnit(value: string) {
  const normalized = normalizeProductName(value).replace(/\.$/, '');
  return units.find(unit => unit.aliases.includes(normalized)) ?? { name: value.trim(), shortName: normalized };
}

export function validateUpdRows(payload: { items: UpdProductRow[] }): UpdProductRow[] {
  if (!Array.isArray(payload?.items) || !payload.items.length || payload.items.length > 500) {
    throw new UnprocessableEntityException('Не удалось прочитать товарные строки УПД');
  }
  const rows = payload.items.filter(row => !isDelivery(row?.name));
  if (!rows.length) throw new UnprocessableEntityException('В УПД нет товарных строк после исключения доставки');
  for (const [index, row] of rows.entries()) {
    if (typeof row?.name !== 'string' || !row.name.trim() || row.name.length > 1000) {
      throw new UnprocessableEntityException(`Не читается наименование товара в строке ${index + 1}`);
    }
    if (typeof row.unit !== 'string' || !row.unit.trim() || row.unit.length > 100) {
      throw new UnprocessableEntityException(`Не читается единица измерения для «${row.name}»`);
    }
    for (const key of ['quantity', 'price', 'totalPrice'] as const) {
      if (row[key] !== null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0)) {
        throw new UnprocessableEntityException(`Некорректное значение ${key} для «${row.name}»`);
      }
    }
  }
  return rows;
}

function isDelivery(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return /^(?:доставка|услуг[аи]\s+(?:(?:по|на)\s+)?доставк[аиуе]|транспортные\s+(?:услуги|работы|расходы))(?:$|[\s:,.(-])/u
    .test(normalizeProductName(name));
}
