import { HttpException, Logger } from "@nestjs/common";

const logger = new Logger('AuthRPC');

export async function executeRpc<T>(call: () => Promise<T>) {
  try {
    return { success: true, data: await call() };
  } catch (error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      return {
        success: false,
        error: {
          status: error.getStatus(),
          message:
            typeof response === "string"
              ? response
              : ((response as { message?: unknown }).message ?? error.message),
        },
      };
    }
    const code = (error as { code?: string })?.code;
    if (code === "P2002")
      return {
        success: false,
        error: { status: 409, message: "Пользователь уже существует" },
      };
    if (code === "P2025")
      return {
        success: false,
        error: { status: 404, message: "Запись не найдена" },
      };
    const name = error instanceof Error ? error.name : 'UnknownError';
    const frames = error instanceof Error ? error.stack?.split('\n').filter(line => /^\s+at /.test(line)).join('\n') : undefined;
    const hint = code === 'P2021' || code === 'P2022'
      ? ' Проверьте DATABASE_URL и миграции auth: отсутствует таблица или поле.' : '';
    logger.error(`${name}${code ? ` [${code}]` : ''}: ошибка обработки auth RPC.${hint}`, frames);
    return {
      success: false,
      error: { status: 500, message: "Внутренняя ошибка auth-сервиса" },
    };
  }
}
