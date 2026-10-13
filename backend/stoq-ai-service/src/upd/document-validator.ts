import { Inject, Injectable } from '@nestjs/common';
import { SETTINGS, Settings } from '../config/environment';
import { extname } from 'node:path';
import sharp from 'sharp';
import { EncryptedPDFError, PDFDocument } from 'pdf-lib';
import { ApiError } from '../common/api-error';

export type DocumentMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';
export interface ValidatedDocument { buffer: Buffer; mimeType: DocumentMimeType; filename: string }

@Injectable()
export class DocumentValidator {
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {}
  async validate(file: Express.Multer.File | undefined): Promise<ValidatedDocument> {
    if (!file) throw new ApiError(400, 'FILE_REQUIRED', 'Загрузите один файл в поле file');
    if (!file.buffer?.length) throw new ApiError(400, 'EMPTY_FILE', 'Файл пуст');
    if (file.buffer.length > this.settings.MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new ApiError(413, 'FILE_TOO_LARGE', 'Превышен допустимый размер файла');
    }
    const mimeType = this.detectType(file.buffer);
    const extensions: Record<DocumentMimeType, string[]> = {
      'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'], 'application/pdf': ['.pdf'],
    };
    if (!extensions[mimeType].includes(extname(file.originalname).toLowerCase()) ||
      (file.mimetype && file.mimetype !== 'application/octet-stream' && file.mimetype !== mimeType)) {
      throw new ApiError(415, 'FILE_TYPE_MISMATCH', 'Расширение или MIME-тип не соответствует содержимому файла');
    }
    if (mimeType === 'application/pdf') await this.validatePdf(file.buffer);
    else await this.validateImage(file.buffer, mimeType);
    return { buffer: file.buffer, mimeType, filename: `document${extensions[mimeType][0]}` };
  }

  private detectType(buffer: Buffer): DocumentMimeType {
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Поддерживаются только PNG, JPEG, WEBP и PDF');
  }

  private async validatePdf(buffer: Buffer): Promise<void> {
    try {
      const pdf = await PDFDocument.load(buffer, { updateMetadata: false, throwOnInvalidObject: true });
      const pageCount = pdf.getPageCount();
      if (pageCount === 0) throw new ApiError(400, 'EMPTY_PDF', 'В PDF нет страниц');
      if (pageCount > this.settings.MAX_PDF_PAGES) {
        throw new ApiError(413, 'TOO_MANY_PAGES', 'Превышено допустимое число страниц PDF');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof EncryptedPDFError) throw new ApiError(400, 'ENCRYPTED_PDF', 'Зашифрованный PDF не поддерживается');
      throw new ApiError(400, 'INVALID_PDF', 'Не удалось прочитать PDF: файл поврежден');
    }
  }

  private async validateImage(buffer: Buffer, mimeType: DocumentMimeType): Promise<void> {
    try {
      // Read dimensions before decoding so oversized images never allocate full pixel buffers.
      const metadata = await sharp(buffer, { limitInputPixels: false, failOn: 'warning', animated: true }).metadata();
      if (!metadata.width || !metadata.height || !metadata.format || `image/${metadata.format}` !== mimeType) {
        throw new ApiError(400, 'INVALID_IMAGE', 'Не удалось прочитать изображение');
      }
      if ((metadata.pages ?? 1) !== 1) throw new ApiError(400, 'ANIMATED_IMAGE', 'Многокадровые изображения не поддерживаются');
      if (metadata.width * metadata.height > this.settings.MAX_IMAGE_PIXELS) {
        throw new ApiError(413, 'TOO_MANY_PIXELS', 'Превышен допустимый размер изображения в пикселях');
      }
      await sharp(buffer, { limitInputPixels: this.settings.MAX_IMAGE_PIXELS, failOn: 'warning' }).stats();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, 'INVALID_IMAGE', 'Не удалось декодировать изображение: файл поврежден');
    }
  }
}
