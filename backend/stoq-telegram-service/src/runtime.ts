import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
  Logger,
} from "@nestjs/common";
import { RabbitSubscribe } from "@golevelup/nestjs-rabbitmq";
import { Pool, PoolClient } from "pg";
import { Store } from "./store";
import { Engine } from "./engine";
import { Delivery } from "./delivery";
import { BotApi, TelegramError } from "./bot-api";
import { SessionCipher } from "./core";
import { eventInput } from "./events";
import { CommandBusService } from "./common/rabbitMQ/command-bus.service";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "./common/rabbitMQ/rabbitmq-topology";
const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
@Injectable()
export class Runtime implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(Runtime.name);
  readonly store: Store;
  private engine?: Engine;
  private api?: BotApi;
  private lock?: PoolClient;
  private stopping = false;
  private lastPollAt: string | null = null;
  private pollError = false;
  private lastWorkerAt: string | null = null;
  private workerError = false;
  constructor(private readonly bus: CommandBusService) {
    if (!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 6,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", () =>
      this.logger.error("Telegram database connection unavailable"),
    );
    this.store = new Store(pool);
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (token) {
      if (!/^\d+:[\w-]{20,}$/.test(token))
        throw Error("Invalid Telegram bot configuration");
      this.api = new BotApi(token);
      this.engine = new Engine(
        this.store,
        bus,
        this.api,
        new SessionCipher(process.env.TELEGRAM_SESSION_KEY ?? ""),
      );
    }
  }
  async onModuleInit() {
    await this.store.pool.query(
      "SELECT next_offset FROM telegram_cursor WHERE id=1",
    );
    this.lock = await this.store.pool.connect();
    this.lock.on("error", () => {
      this.stopping = true;
      this.logger.error("Telegram worker lock connection lost");
    });
    const result = await this.lock.query(
      "SELECT pg_try_advisory_lock(3007002) AS acquired",
    );
    if (!result.rows[0].acquired)
      throw Error("Another Telegram worker is already running");
    if (!this.api || !this.engine) {
      this.logger.log("Telegram waiting for configuration");
      return;
    }
    void this.poll();
    void this.worker();
  }
  async health() {
    await this.store.pool.query("SELECT 1");
    return {
      status: "ok",
      service: "telegram",
      database: "ok",
      bot: !this.api
        ? "waiting_configuration"
        : this.pollError || this.stopping
          ? "degraded"
          : this.lastPollAt
            ? "polling"
            : "connecting",
      lastPollAt: this.lastPollAt,
      telegramReachable: !!this.lastPollAt && !this.pollError,
      pollingError: this.pollError,
      workerError: this.workerError,
      lastWorkerAt: this.lastWorkerAt,
    };
  }
  private async poll() {
    let failures = 0;
    while (!this.stopping) {
      try {
        const offset = await this.store.offset();
        const updates = await this.api!.updates(offset);
        if (!Array.isArray(updates)) throw Error("Invalid update response");
        this.lastPollAt = new Date().toISOString();
        this.pollError = false;
        failures = 0;
        for (const update of updates) {
          if (this.stopping) break;
          if (
            !Number.isSafeInteger(update?.update_id) ||
            update.update_id < offset
          )
            continue;
          await this.engine!.handle(update);
          // Safe cursor is advanced only after handling; no raw update is persisted.
          await this.store.advance(update.update_id + 1);
        }
      } catch (error) {
        if (!this.pollError)
          this.logger.warn("Telegram polling unavailable; retrying");
        this.pollError = true;
        const retry = error instanceof TelegramError ? error.retryMs : null;
        await delay(
          retry ?? Math.min(60000, 1000 * 2 ** Math.min(6, failures++)),
        );
      }
    }
  }
  private async worker() {
    const delivery = new Delivery(this.store, this.engine!, this.api!);
    let lastSchedule = 0,
      lastCleanup = 0;
    while (!this.stopping) {
      try {
        const now = Date.now();
        if (now - lastSchedule >= 30000) {
          await this.engine!.finishBlocked();
          await this.store.schedule(new Date(now));
          lastSchedule = now;
        }
        if (now - lastCleanup >= 3600000) {
          await this.store.cleanup();
          lastCleanup = now;
        }
        const processed = await delivery.once();
        this.workerError = false;
        this.lastWorkerAt = new Date().toISOString();
        if (!processed) await delay(1000);
      } catch {
        if (!this.workerError)
          this.logger.warn("Telegram outbox unavailable; retrying");
        this.workerError = true;
        await delay(5000);
      }
    }
  }
  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.STOCK_CHANGED,
    queue: QUEUES.STOCK,
    queueOptions: { durable: true },
  })
  async stock(payload: any, message: any) {
    const event = eventInput("stock", payload, message);
    if (event) await this.store.recordEvent(event);
  }
  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.BATCH_EXPIRED,
    queue: QUEUES.EXPIRY,
    queueOptions: { durable: true },
  })
  async expired(payload: any, message: any) {
    const event = eventInput("expiry", payload, message);
    if (event) await this.store.recordEvent(event);
  }
  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.STOP_LIST_UPDATED,
    queue: QUEUES.STATUS,
    queueOptions: { durable: true },
  })
  async status(payload: any, message: any) {
    const event = eventInput("status", payload, message);
    if (event) await this.store.recordEvent(event);
  }
  async onApplicationShutdown() {
    this.stopping = true;
    if (this.lock) {
      await this.lock
        .query("SELECT pg_advisory_unlock(3007002)")
        .catch(() => {});
      this.lock.release();
    }
    await this.store.pool.end();
  }
}
