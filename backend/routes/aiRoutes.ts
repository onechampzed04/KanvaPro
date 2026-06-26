// backend/routes/aiRoutes.ts
// Route proxy bảo mật cho AI Image Generation:
// - GET  /api/ai/packages        → Lấy danh sách gói token đang bán
// - POST /api/ai/generate-image  → Tạo ảnh AI (yêu cầu đăng nhập, kiểm tra & trừ token)

import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import db from '../config/db';

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai/packages
// Trả về danh sách các gói token đang active để Frontend hiển thị trên Modal mua
// ─────────────────────────────────────────────────────────────────────────────
router.get('/packages', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, name, price, token_amount, description
       FROM token_packages
       WHERE is_active = true
       ORDER BY token_amount ASC`
    );
    res.json({ packages: result.rows });
  } catch (error) {
    console.error('[AI Packages] Lỗi lấy danh sách gói token:', error);
    res.status(500).json({ error: 'Không thể lấy danh sách gói token' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/generate-image
// Proxy an toàn:
//  1. Kiểm tra token còn lại của user (>= 1)
//  2. Gọi Flask AI Service để tạo ảnh
//  3. Trừ 1 token sau khi tạo ảnh thành công
//  4. Trả ảnh về Frontend
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate-image', authenticate, async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt không được để trống' });
  }

  try {
    // 1. Kiểm tra số dư token (dùng FOR UPDATE để tránh race condition)
    const userRes = await db.query(
      `SELECT ai_tokens FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    }

    const currentTokens = Number(userRes.rows[0].ai_tokens ?? 0);

    if (currentTokens <= 0) {
      return res.status(403).json({
        error: 'Bạn đã hết token AI. Vui lòng mua thêm gói token để tiếp tục tạo ảnh.',
        code: 'INSUFFICIENT_TOKENS',
      });
    }

    // 2. Gọi Flask AI Service
    let aiResponse: globalThis.Response;
    try {
      aiResponse = await fetch(`${AI_SERVICE_URL}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: AbortSignal.timeout(120_000), // timeout 2 phút (Vertex AI có thể chậm)
      });
    } catch (fetchError: any) {
      console.error('[AI Proxy] Không thể kết nối đến AI Service:', fetchError?.message);
      return res.status(503).json({ error: 'Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau.' });
    }

    if (!aiResponse.ok) {
      const errorData = await aiResponse.json().catch(() => ({})) as any;
      console.error('[AI Proxy] Flask trả lỗi:', errorData);
      return res.status(aiResponse.status).json({
        error: errorData?.error || 'Tạo ảnh thất bại. Vui lòng thử lại.',
      });
    }

    const data = await aiResponse.json() as any;
    if (!data?.url) {
      return res.status(500).json({ error: 'AI Service không trả về ảnh hợp lệ.' });
    }

    // 3. Trừ 1 token sau khi tạo ảnh thành công
    await db.execute(
      `UPDATE users SET ai_tokens = ai_tokens - 1 WHERE id = $1`,
      [userId]
    );

    // 4. Lấy số dư mới để trả về cùng response
    const updatedUser = await db.getOne<{ ai_tokens: number }>(
      `SELECT ai_tokens FROM users WHERE id = $1`,
      [userId]
    );

    console.log(`✅ [AI] User ${userId} tạo ảnh thành công. Token còn lại: ${updatedUser?.ai_tokens}`);

    // 5. Trả ảnh + số dư token mới về Frontend
    return res.json({
      url: data.url,
      ai_tokens_remaining: updatedUser?.ai_tokens ?? currentTokens - 1,
    });

  } catch (error: any) {
    console.error('[AI Proxy] Lỗi server:', error);
    return res.status(500).json({ error: 'Lỗi server khi tạo ảnh AI' });
  }
});

export default router;
