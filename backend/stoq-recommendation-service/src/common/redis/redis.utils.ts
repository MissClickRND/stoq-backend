import Redis from 'ioredis';

export async function scanDel(redis: Redis, pattern: string) {
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      200,
    );

    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(keys);
    }
  } while (cursor !== '0');
}