export async function executeRpc<T>(call: () => Promise<T>) {
  try {
    const data = await call();
    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: {
        status: error.status || 500,
        message: error.message || "Внутренняя ошибка сервера",
      },
    };
  }
}
