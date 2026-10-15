import { HttpException } from "@nestjs/common";

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
    return {
      success: false,
      error: { status: 500, message: "Внутренняя ошибка auth-сервиса" },
    };
  }
}
