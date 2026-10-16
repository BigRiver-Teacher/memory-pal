const MISSING_ENV_MESSAGE_PREFIX = "Missing environment variable";

// 服务端读不到环境变量时 getRequiredEnv 会抛出这个错误。它属于部署配置
// 问题，重试没有意义，必须和"读取数据失败"区分开，否则使用者会误以为
// 数据丢了（Vercel 上缺服务端变量时就是这个表现）。
export function isMissingEnvError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith(MISSING_ENV_MESSAGE_PREFIX)
  );
}

export function describeApiFailure(
  error: unknown,
  fallback: string,
): string {
  return isMissingEnvError(error)
    ? "服务端环境变量未配置完整，请联系管理员。"
    : fallback;
}