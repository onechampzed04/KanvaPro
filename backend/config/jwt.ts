// backend/config/jwt.ts
// ─── Centralized JWT Secret — Single Source of Truth ─────────────────────────
//
// [FIX Vấn đề 20] Tập trung JWT_SECRET vào 1 chỗ duy nhất.
// TRƯỚC: 4 file (authController, authMiddleware, isAdmin, collaboration) đều có
//         const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
//         → Quên set env var khi deploy production = anyone can forge JWT.
//
// SAU: Import từ đây. Nếu NODE_ENV=production mà thiếu JWT_SECRET → crash ngay
//      thay vì chạy với secret đã biết trước.

const rawSecret = process.env.JWT_SECRET;

if (!rawSecret && process.env.NODE_ENV === 'production') {
  // Crash the process immediately — safer than running insecurely.
  console.error('❌ FATAL: JWT_SECRET environment variable is not set in production!');
  process.exit(1);
}

export const JWT_SECRET: string = rawSecret || 'dev-secret-key';
