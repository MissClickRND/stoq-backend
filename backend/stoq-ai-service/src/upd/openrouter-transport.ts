import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import OpenAI from 'openai';
import { fetch, ProxyAgent } from 'undici';
import { SETTINGS, Settings } from '../config/environment';

@Injectable()
export class OpenRouterTransport implements OnModuleDestroy {
  readonly client: OpenAI;
  private readonly proxy: ProxyAgent | undefined;

  constructor(@Inject(SETTINGS) settings: Settings) {
    if (settings.AI_PROXY_URL) this.proxy = new ProxyAgent({ uri: settings.AI_PROXY_URL, proxyTunnel: true });
    this.client = new OpenAI({
      apiKey: settings.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: settings.OPENROUTER_TIMEOUT_MS,
      maxRetries: 0,
      fetch: fetch as unknown as typeof globalThis.fetch,
      fetchOptions: this.proxy ? { dispatcher: this.proxy } : {},
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.proxy?.close();
  }
}
