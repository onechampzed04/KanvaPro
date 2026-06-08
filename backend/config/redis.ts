// backend/config/redis.ts
// Redis client singleton dùng chung cho:
//   - Socket.io Redis Adapter (Vấn đề 6: cross-server socket events)
//   - RedisPresenceService (rooms, elementLocks, onlineUsers)
//   - Write-behind cache (Vấn đề 8: throttled DB flush)
//
// Graceful Fallback: Nếu REDIS_URL không được cấu hình hoặc Redis không khả dụng,
// module trả về null và các service sẽ tự động dùng in-memory Map cục bộ.
// Điều này cho phép phát triển local mà không cần cài Redis.

import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let isRedisAvailable = false;

export async function connectRedis(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not set — running in single-instance mode (in-memory state).');
    return null;
  }

  try {
    const client = createClient({ url: redisUrl }) as RedisClientType;

    client.on('error', (err) => {
      // Không throw — chỉ log để tránh crash server khi Redis tạm thời down
      console.warn('[Redis] Client error:', err.message);
    });

    client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    await client.connect();
    redisClient = client;
    isRedisAvailable = true;
    console.log('✅ [Redis] Connected to Redis successfully.');
    return client;
  } catch (err: any) {
    console.warn('[Redis] Failed to connect — falling back to in-memory mode:', err.message);
    return null;
  }
}

/** Trả về Redis client nếu đang kết nối, null nếu không khả dụng */
export function getRedis(): RedisClientType | null {
  return isRedisAvailable ? redisClient : null;
}

export function isRedisConnected(): boolean {
  return isRedisAvailable && redisClient !== null;
}
