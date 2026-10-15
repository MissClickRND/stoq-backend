import { Store } from "./store";
import { Engine } from "./engine";
import { BotApi, TelegramError } from "./bot-api";
import { RpcFailure } from "./core";
export class Delivery {
  constructor(
    private readonly store: Store,
    private readonly engine: Engine,
    private readonly api: BotApi,
  ) {}
  async once(): Promise<boolean> {
    const intent = await this.store.claim();
    if (!intent) return false;
    try {
      const text = await this.engine.render(intent);
      const b = await this.store.binding(intent.chat_id);
      if (
        !text ||
        !b ||
        b.blocked ||
        b.restaurant_id !== intent.restaurant_id ||
        (intent.kind === "daily" && !b.daily_enabled) ||
        (!["summary", "daily"].includes(intent.kind) &&
          !b.preferences[intent.kind])
      ) {
        await this.store.finish(intent.id, "cancelled");
        return true;
      }
      await this.engine.authorize(b);
      await this.api.send(intent.chat_id, text, {}, intent.attempts);
      // A crash after Telegram accepts this call can cause a duplicate after restart.
      await this.store.finish(intent.id, "sent");
    } catch (error) {
      if (error instanceof TelegramError && error.blocked) {
        await this.store.block(intent.chat_id);
        await this.store.finish(intent.id, "cancelled");
      } else if (
        (error instanceof RpcFailure && [401, 403].includes(error.status)) ||
        (error instanceof TelegramError && error.retryMs === null)
      )
        await this.store.finish(intent.id, "cancelled");
      else
        await this.store.retry(
          intent.id,
          error instanceof TelegramError
            ? error.retryMs!
            : Math.min(3600000, 5000 * 2 ** Math.min(9, intent.attempts)),
        );
    }
    return true;
  }
}
