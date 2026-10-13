import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SETTINGS, Settings, validateEnvironment } from "./environment";

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
  ],
  providers: [
    {
      provide: SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Settings =>
        validateEnvironment({
          NODE_ENV: config.get("NODE_ENV"),
          HOST: config.get("HOST"),
          PORT: config.get("PORT"),
          RABBITMQ_ENABLED: config.get("RABBITMQ_ENABLED"),
          RABBITMQ_URL: config.get("RABBITMQ_URL"),
          OPENROUTER_API_KEY: config.get("OPENROUTER_API_KEY"),
          OPENROUTER_MODEL: config.get("OPENROUTER_MODEL"),
          OPENROUTER_PDF_ENGINE: config.get("OPENROUTER_PDF_ENGINE"),
          AI_PROXY_URL: config.get("AI_PROXY_URL"),
          OPENROUTER_TIMEOUT_MS: config.get("OPENROUTER_TIMEOUT_MS"),
          OPENROUTER_MAX_OUTPUT_TOKENS: config.get(
            "OPENROUTER_MAX_OUTPUT_TOKENS",
          ),
          MAX_FILE_SIZE_MB: config.get("MAX_FILE_SIZE_MB"),
          MAX_PDF_PAGES: config.get("MAX_PDF_PAGES"),
          MAX_IMAGE_PIXELS: config.get("MAX_IMAGE_PIXELS"),
          MAX_CONCURRENT_RECOGNITIONS: config.get(
            "MAX_CONCURRENT_RECOGNITIONS",
          ),
          SERVICE_API_KEY: config.get("SERVICE_API_KEY"),
        }),
    },
  ],
  exports: [SETTINGS],
})
export class SettingsModule {}
