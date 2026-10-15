import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export class SessionCipher {
  private readonly key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, "base64");
    if (this.key.length !== 32 || this.key.toString("base64") !== key)
      throw new Error("TELEGRAM_SESSION_KEY must be base64 encoded 32 bytes");
  }
  encrypt(token: string, id: string): string {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(id));
    const encrypted = Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    );
  }
  decrypt(token: string, id: string): string {
    const data = Buffer.from(token, "base64"),
      cipher = createDecipheriv("aes-256-gcm", this.key, data.subarray(0, 12));
    cipher.setAAD(Buffer.from(id));
    cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
      cipher.update(data.subarray(28)),
      cipher.final(),
    ]).toString("utf8");
  }
}
export interface PrivateInput {
  userId: string;
  chatId: string;
  text: string;
  messageId: number;
  callbackId?: string;
}
export function privateMessage(update: any): PrivateInput | null {
  const callback = update?.callback_query,
    message = callback?.message ?? update?.message,
    from = callback?.from ?? message?.from;
  if (
    message?.chat?.type !== "private" ||
    !Number.isSafeInteger(from?.id) ||
    from.id <= 0 ||
    from.id !== message.chat.id
  )
    return null;
  const text = callback?.data ?? message?.text;
  if (typeof text !== "string" || text.length > 4096) return null;
  return {
    userId: String(from.id),
    chatId: String(message.chat.id),
    text,
    messageId: message.message_id,
    callbackId: callback?.id,
  };
}
export function moscowDay(date: Date): string {
  return new Date(date.getTime() + 10800000).toISOString().slice(0, 10);
}
export function scheduledDate(date: Date, time: string): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const local = new Date(date.getTime() + 10800000);
  if (local.toISOString().slice(11, 16) < time) return null;
  return new Date(local.getTime() - 86400000).toISOString().slice(0, 10);
}
export function retryDecision(
  status: number,
  body: any,
  attempt: number,
): { retryMs: number | null; blocked: boolean } {
  if (status === 403) return { retryMs: null, blocked: true };
  if (status === 429)
    return {
      retryMs:
        Math.max(
          1,
          Math.min(86400, Number(body?.parameters?.retry_after) || 30),
        ) * 1000,
      blocked: false,
    };
  if (status === 0 || status >= 500)
    return {
      retryMs: Math.min(3600000, 1000 * 2 ** Math.min(12, attempt)),
      blocked: false,
    };
  return { retryMs: null, blocked: false };
}
export interface DishState {
  dishId: number;
  name?: string;
  dishName?: string;
  status: string;
}
export function statusChanges(
  previous: DishState[] | null,
  current: DishState[],
): DishState[] {
  if (previous === null) return [];
  const old = new Map(previous.map((d) => [d.dishId, d.status]));
  return current.filter((d) =>
    old.has(d.dishId)
      ? old.get(d.dishId) !== d.status
      : d.status !== "AVAILABLE",
  );
}
export function safeText(value: unknown): string {
  return String(value ?? "")
    .slice(0, 550)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
export class RpcFailure extends Error {
  constructor(public readonly status: number) {
    super("RPC unavailable");
  }
}
export function unwrap<T>(response: any): T {
  if (response?.success === true) return response.data as T;
  throw new RpcFailure(Number(response?.error?.status) || 503);
}
