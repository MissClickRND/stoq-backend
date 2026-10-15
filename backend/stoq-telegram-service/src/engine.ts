import { randomUUID } from "node:crypto";
import { Store, Intent, Binding } from "./store";
import {
  SessionCipher,
  privateMessage,
  moscowDay,
  safeText,
  unwrap,
  RpcFailure,
} from "./core";
import { BotApi } from "./bot-api";
import { CommandBusService } from "./common/rabbitMQ/command-bus.service";
import { restaurantStorage } from "./common/tenant/restaurant-context";
const MENU = {
  reply_markup: {
    keyboard: [
      [{ text: "📊 Сводка сейчас" }],
      [{ text: "🔔 Уведомления" }, { text: "🗓 Ежедневная сводка" }],
      [{ text: "🚪 Выйти" }],
    ],
    resize_keyboard: true,
  },
};
const labels: Record<string, string> = {
  stock: "📦 Поставки и остатки",
  writeoff: "📝 Списания и инвентаризация",
  expiry: "⏳ Истечение срока",
  status: "🍽 Стоп-лист и восстановление",
};
const amount = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n)
    ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)
    : "нет данных";
const summaryDate = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : safeText(date);
};
interface Conversation {
  stage: "email" | "password";
  email?: string;
  expires: number;
}
interface AuthUser {
  id: number;
  restaurantId: number;
  role: string;
}
export class Engine {
  private readonly conversations = new Map<string, Conversation>();
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(
    private readonly store: Store,
    private readonly bus: CommandBusService,
    private readonly api: BotApi,
    private readonly cipher: SessionCipher,
    private readonly now = () => Date.now(),
  ) {}
  private prune() {
    for (const [id, c] of this.conversations)
      if (c.expires < this.now()) this.conversations.delete(id);
    for (const [id, a] of this.attempts)
      if (a.until < this.now()) this.attempts.delete(id);
  }
  async authorize(b: Binding): Promise<AuthUser> {
    try {
      if (b.blocked || new Date(b.expires_at).getTime() <= this.now())
        throw new RpcFailure(401);
      let token: string;
      try {
        token = this.cipher.decrypt(b.encrypted_session, b.telegram_user_id);
      } catch {
        throw new RpcFailure(401);
      }
      const user = unwrap<AuthUser>(
        await this.bus.sendCommand(
          "app.commands",
          "command.auth.telegram_verify",
          { sessionToken: token, telegramUserId: b.telegram_user_id },
        ),
      );
      if (
        !user ||
        !["ADMIN", "MANAGER"].includes(user.role) ||
        user.restaurantId !== b.restaurant_id ||
        user.id !== b.user_id
      )
        throw new RpcFailure(403);
      return user;
    } catch (error) {
      if (error instanceof RpcFailure && [401, 403].includes(error.status))
        await this.store.remove(b.chat_id);
      throw error;
    }
  }
  async handle(update: any): Promise<void> {
    const input = privateMessage(update);
    if (!input) return;
    const { chatId, userId } = input;
    // Consume no raw update beyond this function, and never retain password text in conversation state.
    let text = input.text.trim();
    const awaiting = this.conversations.get(userId);
    if (awaiting?.stage === "password") {
      try {
        await this.api.delete(chatId, input.messageId);
      } catch {
        this.conversations.delete(userId);
        await this.api.send(
          chatId,
          "Не удалось удалить сообщение. Удалите его вручную и начните /login заново.",
        );
        return;
      }
    }
    this.prune();
    if (input.callbackId)
      await this.api.answer(input.callbackId).catch(() => {});
    const aliases: Record<string, string> = {
      "📊 Сводка сейчас": "/summary",
      "🔔 Уведомления": "/settings",
      "🗓 Ежедневная сводка": "/daily",
      "🚪 Выйти": "/logout",
      "Сводка сейчас": "/summary",
      Уведомления: "/settings",
      "Ежедневная сводка": "/daily",
      Выйти: "/logout",
    };
    text = aliases[text] ?? text;
    if (text === "/cancel") {
      this.conversations.delete(userId);
      await this.api.send(chatId, "Ввод отменён.");
      return;
    }
    if (text === "/logout") {
      this.conversations.delete(userId);
      const b = await this.store.binding(chatId);
      if (b) {
        try {
          unwrap(
            await this.bus.sendCommand(
              "app.commands",
              "command.auth.telegram_logout",
              {
                sessionToken: this.cipher.decrypt(b.encrypted_session, userId),
                telegramUserId: userId,
              },
            ),
          );
        } catch (error) {
          if (!(
            error instanceof RpcFailure && [401, 403].includes(error.status)
          )) {
            await this.store.block(chatId);
            await this.api.send(
              chatId,
              "Отправка данных отключена. Сервис входа временно недоступен; выход завершится автоматически. Можно повторить /logout.",
            );
            return;
          }
        }
        await this.store.remove(chatId);
      }
      await this.api.send(chatId, "Вы вышли. Telegram-сессия закрыта.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }
    const binding = await this.store.binding(chatId);
    if (text === "/start" || text === "/login") {
      this.conversations.delete(userId);
      if (binding?.blocked) {
        await this.api.send(
          chatId,
          "Завершается выход. Повторите /logout или попробуйте /login позже.",
        );
        return;
      }
      if (binding) {
        try {
          await this.authorize(binding);
          await this.api.send(chatId, "Вы вошли в STOQ.", MENU);
          return;
        } catch (error) {
          if (!(
            error instanceof RpcFailure && [401, 403].includes(error.status)
          )) {
            await this.api.send(
              chatId,
              "Вход временно недоступен. Повторите позже.",
            );
            return;
          }
        }
      }
      if (this.conversations.size >= 10000 || this.attempts.size >= 10000) {
        await this.api.send(chatId, "Сервис занят. Попробуйте позже.");
        return;
      }
      if ((this.attempts.get(userId)?.count ?? 0) >= 5) {
        await this.api.send(
          chatId,
          "Слишком много попыток. Повторите через 15 минут.",
        );
        return;
      }
      this.conversations.set(userId, {
        stage: "email",
        expires: this.now() + 300000,
      });
      await this.api.send(
        chatId,
        "Введите email аккаунта STOQ. /cancel — отмена.",
      );
      return;
    }
    const conversation = this.conversations.get(userId);
    if (conversation) {
      if (conversation.stage === "email") {
        if (text.length > 254 || !/^\S+@\S+\.\S+$/.test(text)) {
          await this.api.send(chatId, "Введите корректный email.");
          return;
        }
        this.conversations.set(userId, {
          stage: "password",
          email: text,
          expires: this.now() + 120000,
        });
        await this.api.send(
          chatId,
          "Введите пароль. Сообщение будет сразу удалено. /cancel — отмена.",
        );
        return;
      }
      this.conversations.delete(userId);
      if ((this.attempts.get(userId)?.count ?? 0) >= 5) {
        await this.api.send(
          chatId,
          "Слишком много попыток. Повторите через 15 минут.",
        );
        return;
      }
      const attempt = this.attempts.get(userId) ?? {
        count: 0,
        until: this.now() + 900000,
      };
      attempt.count++;
      this.attempts.set(userId, attempt);
      if (input.text.length > 512 || !input.text) {
        await this.api.send(chatId, "Не удалось войти. Начните /login заново.");
        return;
      }
      try {
        const result = unwrap<{
          user: AuthUser;
          sessionToken: string;
          expiresAt: string;
        }>(
          await this.bus.sendCommand(
            "app.commands",
            "command.auth.telegram_login",
            {
              dto: { email: conversation.email, password: input.text },
              telegramUserId: userId,
            },
          ),
        );
        if (
          !result.user ||
          !["ADMIN", "MANAGER"].includes(result.user.role) ||
          !Number.isSafeInteger(result.user.restaurantId) ||
          result.user.restaurantId < 1 ||
          !result.sessionToken ||
          !Number.isFinite(Date.parse(result.expiresAt))
        )
          throw new RpcFailure(403);
        await this.store.saveBinding({
          chat_id: chatId,
          telegram_user_id: userId,
          user_id: result.user.id,
          restaurant_id: result.user.restaurantId,
          encrypted_session: this.cipher.encrypt(result.sessionToken, userId),
          expires_at: new Date(result.expiresAt),
          preferences: {
            stock: true,
            writeoff: true,
            expiry: true,
            status: true,
          },
          daily_enabled: false,
          daily_time: "09:00",
          blocked: false,
        });
        this.attempts.delete(userId);
        await this.api.send(
          chatId,
          "Вы вошли в STOQ. Ежедневная сводка по умолчанию выключена.",
          MENU,
        );
      } catch {
        await this.api.send(
          chatId,
          "Не удалось войти. Доступ разрешён руководителям. Начните /login заново.",
        );
      }
      return;
    }
    if (!binding) {
      await this.api.send(chatId, "Войдите через /login.");
      return;
    }
    try {
      await this.authorize(binding);
      if (text === "/summary") {
        await this.store.enqueue(
          chatId,
          binding.restaurant_id,
          "summary",
          `summary:${randomUUID()}`,
          { date: moscowDay(new Date(this.now())) },
        );
        await this.api.send(chatId, "Готовлю сводку…");
        return;
      }
      const toggle = /^toggle:(stock|writeoff|expiry|status)$/.exec(text);
      if (toggle) {
        await this.store.preference(chatId, toggle[1]);
        await this.settings(chatId);
        return;
      }
      if (text === "/settings") {
        await this.settings(chatId);
        return;
      }
      if (text === "daily:toggle") {
        await this.store.daily(
          chatId,
          !binding.daily_enabled,
          binding.daily_time,
        );
        await this.dailyMenu(chatId);
        return;
      }
      if (text === "/daily") {
        await this.dailyMenu(chatId);
        return;
      }
      const time = /^\/daily\s+([0-2]\d:[0-5]\d)$/.exec(text);
      if (time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time[1])) {
        await this.store.daily(chatId, true, time[1]);
        await this.dailyMenu(chatId);
        return;
      }
      await this.api.send(
        chatId,
        "Используйте меню или /summary, /settings, /daily HH:mm, /logout.",
        MENU,
      );
    } catch (error) {
      await this.api.send(
        chatId,
        error instanceof RpcFailure && [401, 403].includes(error.status)
          ? "Сессия завершена. Войдите через /login."
          : "Данные временно недоступны. Попробуйте позже.",
      );
    }
  }
  async finishBlocked(): Promise<void> {
    for (const b of await this.store.blockedBindings()) {
      try {
        unwrap(
          await this.bus.sendCommand(
            "app.commands",
            "command.auth.telegram_logout",
            {
              sessionToken: this.cipher.decrypt(
                b.encrypted_session,
                b.telegram_user_id,
              ),
              telegramUserId: b.telegram_user_id,
            },
          ),
        );
        await this.store.remove(b.chat_id);
      } catch (error) {
        if (error instanceof RpcFailure && [401, 403].includes(error.status))
          await this.store.remove(b.chat_id);
      }
    }
  }
  private async settings(chat: string) {
    const b = await this.store.binding(chat);
    if (!b) return;
    await this.api.send(chat, "<b>🔔 Уведомления</b>\nВыберите, какие события присылать:", {
      reply_markup: {
        inline_keyboard: Object.entries(labels).map(([key, label]) => [
          {
            text: `${b.preferences[key] ? "✅" : "⬜"} ${label}`,
            callback_data: `toggle:${key}`,
          },
        ]),
      },
    });
  }
  private async dailyMenu(chat: string) {
    const b = await this.store.binding(chat);
    if (!b) return;
    await this.api.send(
      chat,
      `<b>🗓 Ежедневная сводка</b>\n\n${b.daily_enabled ? "✅ Включена" : "🔕 Выключена"}\n🕘 Время: <b>${b.daily_time} МСК</b>\n📅 За предыдущий полный день\n\nИзменить время: <code>/daily HH:mm</code>`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: b.daily_enabled ? "🔕 Выключить" : "🔔 Включить",
                callback_data: "daily:toggle",
              },
            ],
          ],
        },
      },
    );
  }
  async render(intent: Intent): Promise<string | null> {
    const b = await this.store.binding(intent.chat_id);
    if (!b || b.blocked || b.restaurant_id !== intent.restaurant_id)
      return null;
    if (intent.kind === "daily" && !b.daily_enabled) return null;
    if (
      !["summary", "daily"].includes(intent.kind) &&
      !b.preferences[intent.kind]
    )
      return null;
    await this.authorize(b);
    if (intent.kind === "summary" || intent.kind === "daily")
      return this.summary(b, intent.payload.date);
    if (intent.kind === "status") {
      const statuses: Record<string, string> = {
        AVAILABLE: "снова доступно",
        LOW_STOCK: "мало порций",
        STOP_LIST: "стоп-лист",
      };
      return (
        "Изменения доступности блюд:\n" +
        (intent.payload.changes ?? [])
          .slice(0, 12)
          .map(
            (d: any) =>
              `${safeText(String(d.name ?? d.dishName ?? `Блюдо №${d.dishId}`).slice(0, 50))} — ${statuses[d.status] ?? "изменено"}`,
          )
          .join("\n")
      );
    }
    return {
      stock: "Обновлены поставки или остатки.",
      writeoff: "Проведено списание или инвентаризация.",
      expiry: "Истёк срок годности партии. Проверьте склад.",
    }[intent.kind];
  }
  private async summary(b: Binding, date: string): Promise<string> {
    const data: any[] = [];
    const queries: [string, any][] = [
      ["command.recommendation.get_daily_statistics", { date }],
      ["command.recommendation.get_dish_statistics", {}],
      ["command.inventory.get_statistics", {}],
      ["command.inventory.get_expiring_inventory", { daysThreshold: 7 }],
      ["command.inventory.get_write_offs", {}],
    ];
    for (const [key, payload] of queries) {
      await this.authorize(b);
      try {
        data.push(
          unwrap(
            await restaurantStorage.run(b.restaurant_id, () =>
              this.bus.sendCommand("app.commands", key, payload),
            ),
          ),
        );
      } catch (e) {
        if (e instanceof RpcFailure && [401, 403].includes(e.status)) throw e;
        data.push(null);
      }
    }
    const [finance, dishes, inventory, expiring, writeoffs] = data;
    const expiryCount = Array.isArray(expiring) ? expiring.length : null;
    const awaiting = Array.isArray(writeoffs)
      ? writeoffs.length
      : typeof writeoffs?.awaitingDisposal === "number"
        ? writeoffs.awaitingDisposal
        : null;
    const low = Array.isArray(inventory?.lowStockProducts)
      ? inventory.lowStockProducts
          .slice(0, 5)
          .map(
            (item: any) =>
              `• ${safeText(String(item.product?.name ?? "Продукт").slice(0, 35))} — <b>${amount(item.quantity)}</b>`,
          )
          .join("\n")
      : "";
    return `<b>📊 Сводка STOQ</b>\n📅 ${summaryDate(date)} · МСК\n\n<b>💰 Продажи</b>\nВыручка — <b>${amount(finance?.revenue)}</b> ₽\nПрибыль по себестоимости — <b>${amount(finance?.earning)}</b> ₽\nЗаказы — <b>${amount(finance?.orders)}</b> · завершено: <b>${amount(finance?.completed)}</b>\nСредний чек — <b>${amount(finance?.averageCheck)}</b> ₽\n\n<b>🍽 Меню</b>\n✅ Доступно: <b>${amount(dishes?.active)}</b>\n🟡 Мало: <b>${amount(dishes?.lowStock)}</b>\n⛔ Стоп-лист: <b>${amount(dishes?.stopList)}</b>\n\n<b>📦 Склад</b>\nВсего продуктов: <b>${amount(inventory?.totalProducts)}</b>\n⚠️ Заканчиваются: <b>${amount(Array.isArray(inventory?.lowStockProducts) ? inventory.lowStockProducts.length : null)}</b>${low ? `\n${low}` : ""}\n⏳ Срок до 7 дней: <b>${amount(expiryCount)}</b> партий\n🗑 Просрочено, ожидает утилизации: <b>${amount(awaiting)}</b>\n\n<i>Остатки актуальны на момент запроса.</i>`;
  }
}
