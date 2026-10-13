import { z } from 'zod';

const DocumentProductSchema = z.strictObject({
  name: z.string().min(1).nullable().describe('Точное наименование товара из графы 1а, null если не читается'),
  quantity: z.number().nonnegative().nullable().describe('Только количество из графы 3 Количество (объем). Коды из графы 2 (ОКЕИ), 1б, 10, 12 и номера строк игнорируются; если графа 3 не читается или не определена — null'),
  price: z.number().nonnegative().nullable().describe('Цена за единицу из графы 4, без вычисления из других граф; null если не читается'),
  totalPrice: z.number().nonnegative().nullable().describe('Стоимость этой товарной строки из графы 9 с налогом, всего. Не итог документа и не quantity * price; null если не читается'),
  unit: z.string().min(1).nullable().describe('Условное обозначение единицы из графы 2а (шт, кг и т.п.), не код ОКЕИ; null если не читается'),
});
export const ProductSchema = DocumentProductSchema.extend({
  price: z.number().int().nonnegative().nullable().describe('Цена из графы 4, округленная до ближайшего целого рубля'),
  totalPrice: z.number().int().nonnegative().nullable().describe('Сумма из графы 9, независимо округленная до ближайшего целого рубля'),
});
export const RecognitionSchema = z.strictObject({
  sellerName: z.string().min(1).nullable().describe('Точное наименование продавца из строки Продавец (2), не покупатель или грузоотправитель. null если отсутствует или не читается'),
  items: z.array(ProductSchema),
});
// Keep document decimals in the model response; round deterministically on the server.
export const ExtractionSchema = z.strictObject({
  documentType: z.enum(['upd', 'other', 'unreadable']),
  sellerName: RecognitionSchema.shape.sellerName,
  items: z.array(DocumentProductSchema.omit({ quantity: true }).extend({
    quantityColumn3Text: z.string().min(1).nullable().describe('Дословный текст ТОЛЬКО ячейки под заголовком Количество (объем), графа с номером 3. Не третий видимый столбец. Столбец 2 код ОКЕИ полностью игнорировать. Не преобразовывать число, сохранить запятую. Примеры: 1,000 или 2,500. Если ячейка графы 3 не читается — null'),
  })),
});
export type Product = z.infer<typeof ProductSchema>;
export type Recognition = z.infer<typeof RecognitionSchema>;
