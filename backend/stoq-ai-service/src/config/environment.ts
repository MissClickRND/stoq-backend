import { z } from "zod";

export const SETTINGS = Symbol("SETTINGS");
const integer = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);
const EnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: integer(3006, 1, 65535),
  RABBITMQ_ENABLED: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .transform((value) => value === true || value === "true")
    .default(true),
  RABBITMQ_URL: z
    .string()
    .url()
    .refine((value) => ["amqp:", "amqps:"].includes(new URL(value).protocol))
    .default("amqp://admin:admin@localhost:5672"),
  OPENROUTER_API_KEY: z
    .string()
    .trim()
    .min(1)
    .refine((key) => !key.startsWith("replace-"), "Укажите настоящий API-ключ"),
  OPENROUTER_MODEL: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]+$/)
    .default("openai/gpt-4.1-mini"),
  OPENROUTER_PDF_ENGINE: z
    .enum(["native", "mistral-ocr", "cloudflare-ai"])
    .default("native"),
  AI_PROXY_URL: z
    .string()
    .trim()
    .default("")
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          Boolean(url.hostname) &&
          url.pathname === "/" &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    }, "Укажите HTTP/HTTPS-прокси без пути, query и fragment"),
  OPENROUTER_TIMEOUT_MS: integer(120000, 1000, 300000),
  OPENROUTER_MAX_OUTPUT_TOKENS: integer(16000, 256, 100000),
  MAX_FILE_SIZE_MB: integer(20, 1, 20),
  MAX_PDF_PAGES: integer(30, 1, 100),
  MAX_IMAGE_PIXELS: integer(40000000, 1, 100000000),
  MAX_CONCURRENT_RECOGNITIONS: integer(2, 1, 20),
  SERVICE_API_KEY: z.string().trim().default(""),
});
export type Settings = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(env: Record<string, unknown>): Settings {
  const parsed = EnvironmentSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Некорректная конфигурация .env: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}
