// backend/middleware/thumbnailRateLimit.ts
// [FIX Vấn đề 11] Sliding Window Rate Limiter cho endpoint /upload-thumbnail
//
// Cơ chế: Sliding Window Counter bằng Redis.
// Mỗi userId được phép upload tối đa MAX_UPLOADS lần trong cửa sổ thời gian WINDOW_SECONDS.
// Nếu Redis không khả dụng, rate limiter bị bỏ qua (fail-open) — chấp nhận được vì
// bản thân authenticate middleware đã bảo vệ endpoint rồi.

import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis';

const MAX_UPLOADS = 5;          // Tối đa 5 ảnh thumbnail / user
const WINDOW_SECONDS = 60;     // Trong vòng 60 giây

export const thumbnailRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const redis = getRedis();
  if (!redis) {
    // Redis không khả dụng → fail-open (vẫn cho qua, đã có auth bảo vệ)
    return next();
  }

  // Sliding Window: key theo user + window 1 phút
  const windowKey = `ratelimit:thumbnail:${userId}:${Math.floor(Date.now() / (WINDOW_SECONDS * 1000))}`;

  try {
    const count = await redis.incr(windowKey);
    if (count === 1) {
      // Lần đầu trong cửa sổ này → đặt TTL
      await redis.expire(windowKey, WINDOW_SECONDS * 2); // *2 để tránh race condition tại ranh giới window
    }

    if (count > MAX_UPLOADS) {
      return res.status(429).json({
        error: 'TooManyRequests',
        message: `Bạn chỉ được tải lên tối đa ${MAX_UPLOADS} ảnh thumbnail mỗi ${WINDOW_SECONDS} giây. Vui lòng thử lại sau.`,
        retryAfter: WINDOW_SECONDS,
      });
    }

    next();
  } catch (err) {
    // Lỗi Redis → fail-open, không chặn user
    console.warn('[RateLimit] Redis error, skipping rate limit:', (err as any)?.message);
    next();
  }
};
