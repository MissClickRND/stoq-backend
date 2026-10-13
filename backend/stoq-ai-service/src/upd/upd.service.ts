import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { SETTINGS, Settings } from '../config/environment';
import { DocumentValidator } from './document-validator';
import { OpenRouterExtractor } from './openrouter-extractor';

@Injectable()
export class UpdService {
  private activeRequests = 0;
  constructor(
    @Inject(SETTINGS) private readonly settings: Settings,
    private readonly validator: DocumentValidator,
    private readonly extractor: OpenRouterExtractor,
  ) {}
  async recognize(file: Express.Multer.File | undefined) {
    if (this.activeRequests >= this.settings.MAX_CONCURRENT_RECOGNITIONS) {
      throw new ApiError(503, 'SERVICE_BUSY', 'Сервис занят, повторите запрос позже');
    }
    this.activeRequests++;
    try {
      return await this.extractor.extract(await this.validator.validate(file));
    } finally {
      this.activeRequests--;
    }
  }
}
