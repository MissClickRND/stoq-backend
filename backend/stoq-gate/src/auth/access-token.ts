export function accessTokenFrom(
  headers: { authorization?: string; cookie?: string },
  cookies?: Record<string, string>,
): string | undefined {
  if (cookies?.accessToken) return cookies.accessToken;
  const cookie = headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('accessToken='));
  if (cookie) {
    try {
      return decodeURIComponent(cookie.slice('accessToken='.length));
    } catch {
      return undefined;
    }
  }
  const match = headers.authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}
