import { retryDecision } from "./core";
export class TelegramError extends Error {
  constructor(
    public readonly retryMs: number | null,
    public readonly blocked: boolean = false,
  ) {
    super("Telegram API request failed");
  }
}
export class BotApi {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async call(method: string, payload: any, attempt = 0): Promise<any> {
    let response: Response, body: any;
    try {
      response = await this.fetcher(
        `https://api.telegram.org/bot${this.token}/${method}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(method === "getUpdates" ? 45000 : 15000),
        },
      );
      body = await response.json();
    } catch {
      throw new TelegramError(retryDecision(0, {}, attempt).retryMs);
    }
    if (!response.ok || body?.ok !== true) {
      const d = retryDecision(
        body?.error_code ?? response.status,
        body,
        attempt,
      );
      throw new TelegramError(d.retryMs, d.blocked);
    }
    return body.result;
  }
  send(chat: string, text: string, extra: any = {}, attempt = 0) {
    return this.call(
      "sendMessage",
      {
        chat_id: chat,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...extra,
      },
      attempt,
    );
  }
  delete(chat: string, messageId: number) {
    return this.call("deleteMessage", { chat_id: chat, message_id: messageId });
  }
  updates(offset: number) {
    return this.call("getUpdates", {
      offset,
      timeout: 30,
      limit: 50,
      allowed_updates: ["message", "callback_query"],
    });
  }
  answer(id: string) {
    return this.call("answerCallbackQuery", { callback_query_id: id });
  }
}
