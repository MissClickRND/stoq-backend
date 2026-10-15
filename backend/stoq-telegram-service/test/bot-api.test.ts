import { test } from "node:test";
import assert from "node:assert/strict";
import { BotApi, TelegramError } from "../src/bot-api";
test("Bot API caps output, disables link previews and never leaks token on transport errors", async () => {
  let sent: any;
  const api = new BotApi("secret", async (_url: any, options: any) => {
    sent = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ ok: true, result: { message_id: 1 } }),
    );
  });
  await api.send("10", "x".repeat(5000));
  assert.ok(sent.text.length <= 4000);
  assert.equal(sent.link_preview_options.is_disabled, true);
  const failed = new BotApi("secret", async () => {
    throw Error("https://api.telegram.org/botsecret");
  });
  await assert.rejects(
    failed.send("10", "x"),
    (e: any) =>
      e instanceof TelegramError &&
      !e.message.includes("secret") &&
      e.retryMs === 1000,
  );
});
test("Bot API classifies rate limit and chat blocks", async () => {
  const api = new BotApi(
    "secret",
    async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          parameters: { retry_after: 11 },
        }),
        { status: 429 },
      ),
  );
  await assert.rejects(api.send("10", "x"), (e: any) => e.retryMs === 11000);
  const blocked = new BotApi(
    "secret",
    async () =>
      new Response(JSON.stringify({ ok: false, error_code: 403 }), {
        status: 403,
      }),
  );
  await assert.rejects(blocked.send("10", "x"), (e: any) => e.blocked === true);
});
