import { Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { SETTINGS, Settings } from '../config/environment';
import { ValidatedDocument } from './document-validator';
import { zodResponseFormat } from 'openai/helpers/zod';
import { ApiError } from '../common/api-error';
import { ExtractionSchema, Recognition, RecognitionSchema } from './product.schema';
import { UPD_EXTRACTION_PROMPT } from './upd.prompt';
import { mapProviderError } from './provider-error';
import { parseQuantityColumn3 } from './quantity-column';

export const OPENROUTER_CLIENT = Symbol('OPENROUTER_CLIENT');
@Injectable()
export class OpenRouterExtractor {
  constructor(@Inject(SETTINGS) private readonly settings: Settings, @Inject(OPENROUTER_CLIENT) private readonly client: OpenAI) {}
  async extract(document: ValidatedDocument): Promise<Recognition> {
    const data = `data:${document.mimeType};base64,${document.buffer.toString('base64')}`;
    const attachment = document.mimeType === 'application/pdf'
      ? { type: 'file' as const, file: { filename: document.filename, file_data: data } }
      : { type: 'image_url' as const, image_url: { url: data, detail: 'high' as const } };
    try {
      const params = {
        model: this.settings.OPENROUTER_MODEL,
        stream: false as const,
        max_tokens: this.settings.OPENROUTER_MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: UPD_EXTRACTION_PROMPT },
          { role: 'user', content: [{ type: 'text', text: 'Извлеки продавца и товарные строки с ценами и суммами из приложенного документа, придерживаясь схемы и правил.' }, attachment] },
        ] satisfies OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        response_format: zodResponseFormat(ExtractionSchema, 'upd_products'),
        provider: { require_parameters: true },
        ...(document.mimeType === 'application/pdf' ? {
          plugins: [{ id: 'file-parser', pdf: { engine: this.settings.OPENROUTER_PDF_ENGINE } }],
        } : {}),
      };
      const response = await this.client.chat.completions.create(params);
      const gatewayError = (response as unknown as { error?: { code?: number } }).error;
      if (gatewayError) {
        throw new OpenAI.APIError(gatewayError.code ?? 502, {}, 'OpenRouter gateway error', new Headers());
      }
      const choice = response.choices?.[0];
      if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') {
        throw new ApiError(422, 'MODEL_REFUSAL', 'Модель отказалась обрабатывать документ');
      }
      if (response.choices?.length !== 1 || choice?.finish_reason !== 'stop') {
        throw new ApiError(502, 'INCOMPLETE_MODEL_RESPONSE', 'OpenRouter вернул неполный ответ; уменьшите документ или увеличьте бюджет ответа');
      }
      let decoded: unknown;
      try { decoded = JSON.parse(choice.message.content ?? ''); }
      catch { throw new ApiError(502, 'INVALID_MODEL_RESPONSE', 'OpenRouter вернул некорректный JSON'); }
      const result = ExtractionSchema.safeParse(decoded);
      if (!result.success) throw new ApiError(502, 'INVALID_MODEL_RESPONSE', 'Ответ OpenRouter не соответствует схеме товаров');
      if (result.data.documentType !== 'upd') {
        throw new ApiError(422, 'UNRECOGNIZABLE_DOCUMENT', 'Документ не является читаемым УПД');
      }
      if (!result.data.items.length) throw new ApiError(422, 'NO_PRODUCTS', 'Не удалось прочитать товарные строки');
      if (result.data.sellerName !== null && !result.data.sellerName.trim()) {
        throw new ApiError(502, 'INVALID_MODEL_RESPONSE', 'Ответ OpenRouter содержит пустое наименование продавца');
      }
      if (result.data.items.some((item) => Object.values(item).every((value) => value === null) ||
        (item.name !== null && !item.name.trim()) || (item.unit !== null && !item.unit.trim()))) {
        throw new ApiError(502, 'INVALID_MODEL_RESPONSE', 'Ответ OpenRouter содержит строки без читаемых значений');
      }
      const sellerName = result.data.sellerName === null ? null : result.data.sellerName
        .replace(/\\+(?=["«»„“”])/g, '')
        .replace(/["«»„“”]/g, '')
        .replace(/\s+/g, ' ')
        .trim() || null;
      const normalized = RecognitionSchema.safeParse({
        sellerName,
        items: result.data.items.map(({ quantityColumn3Text, ...item }) => ({
          ...item,
          quantity: parseQuantityColumn3(quantityColumn3Text),
          price: item.price === null ? null : Math.round(item.price),
          totalPrice: item.totalPrice === null ? null : Math.round(item.totalPrice),
        })),
      });
      if (!normalized.success) throw new ApiError(502, 'INVALID_MODEL_RESPONSE', 'Ответ OpenRouter содержит некорректные значения после нормализации');
      return normalized.data;
    } catch (error) {
      throw mapProviderError(error);
    }
  }
}
