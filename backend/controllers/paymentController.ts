// backend/controllers/paymentController.ts
import { Request, Response } from 'express';
import { paymentService } from '../services/paymentService';
import db from '../config/db';

export const paymentController = {
  // ----------------------------------------------------------------------
  // 1. Tạo Link Thanh Toán (Khi user bấm nút Mua trên Frontend)
  // ----------------------------------------------------------------------
  createCheckout: async (req: Request, res: Response) => {
    try {
      // [FIX Vấn đề 3] Bỏ `amount` khỏi body — backend tự tính giá từ DB.
      // Không bao giờ tin giá tiền do client gửi lên (tránh price tampering).
      const { planId, planName, membersCount, inviteEmails, teamId } = req.body;
      const userId = (req as any).user.id;

      if (!planId || !planName) {
        return res.status(400).json({ error: 'Thiếu thông tin gói (planId, planName)' });
      }

      const checkoutUrl = await paymentService.createPaymentLink(
        userId, planId, planName, membersCount, inviteEmails, teamId
      );
      res.json({ checkoutUrl });
    } catch (error: any) {
      console.error('Lỗi ở paymentController.createCheckout:', error);
      res.status(500).json({ error: error?.message || 'Lỗi server khi khởi tạo thanh toán' });
    }
  },

  // ----------------------------------------------------------------------
  // 2. Verify chủ động — Frontend gọi sau khi PayOS redirect về trang Success
  //    Giải pháp cho localhost (webhook không public được)
  //    PayOS truyền orderCode qua URL: /payment/success?orderCode=xxx
  // ----------------------------------------------------------------------
  verifyPayment: async (req: Request, res: Response) => {
    try {
      const { orderCode } = req.query;

      if (!orderCode || typeof orderCode !== 'string') {
        return res.status(400).json({ success: false, error: 'Thiếu orderCode' });
      }

      const result = await paymentService.verifyAndActivate(orderCode);
      res.json(result);
    } catch (error: any) {
      console.error('Lỗi verify payment:', error);
      // Trả về lỗi cụ thể hơn để debug
      res.status(500).json({ success: false, error: error?.message || 'Lỗi xác minh thanh toán' });
    }
  },

  // ----------------------------------------------------------------------
  // 3. Nhận Webhook từ PayOS (Production — khi server có public URL)
  // ----------------------------------------------------------------------
  payosWebhook: async (req: Request, res: Response) => {
    try {
      await paymentService.handleWebhook(req.body);
      res.json({ success: true, message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('Lỗi ở paymentController.payosWebhook:', error);
      res.status(400).json({ success: false, error: 'Invalid webhook data' });
    }
  },

  // ----------------------------------------------------------------------
  // 4. Lịch sử thanh toán (bao gồm cả Pending để user tự kiểm tra)
  // ----------------------------------------------------------------------
  getBillingHistory: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      // Lấy cả pending để user thấy và bấm "Kiểm tra lại"
      const result = await db.query(`
        SELECT p.id, p.amount, p.status, p.created_at, p.transaction_id, p.metadata,
               us.current_period_start, us.current_period_end
        FROM payments p
        LEFT JOIN user_subscriptions us ON us.id = p.subscription_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
      `, [userId]);
      res.json({ history: result.rows });
    } catch (error) {
      console.error('Lỗi lấy lịch sử thanh toán:', error);
      res.status(500).json({ error: 'Lỗi server khi lấy lịch sử thanh toán' });
    }
  },

  // ----------------------------------------------------------------------
  // 5. User tự kiểm tra giao dịch đang Pending với PayOS
  //    GET /api/payments/verify-order?orderCode=xxx
  // ----------------------------------------------------------------------
  verifyByOrderCode: async (req: Request, res: Response) => {
    try {
      const { orderCode } = req.query;
      if (!orderCode || typeof orderCode !== 'string') {
        return res.status(400).json({ success: false, error: 'Thiếu orderCode' });
      }
      const result = await paymentService.verifyByOrderCode(orderCode);
      res.json(result);
    } catch (error: any) {
      console.error('Lỗi verifyByOrderCode:', error);
      res.status(500).json({ success: false, error: error?.message || 'Lỗi kiểm tra giao dịch' });
    }
  },

  // ----------------------------------------------------------------------
  // 6. Preview cấn trừ trước khi mua gói mới
  //    GET /api/payments/preview-upgrade?planId=xxx
  // ----------------------------------------------------------------------
  previewUpgrade: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { planId, membersCount } = req.query;
      if (!planId || typeof planId !== 'string') {
        return res.status(400).json({ error: 'Thiếu planId' });
      }
      const count = membersCount ? parseInt(membersCount as string, 10) : undefined;
      const preview = await paymentService.previewUpgrade(userId, planId, count);
      res.json(preview);
    } catch (error: any) {
      console.error('Lỗi previewUpgrade:', error);
      const isClientError = error?.message?.includes('không tồn tại') || error?.message?.includes('Không thể hạ cấp');
      res.status(isClientError ? 400 : 500).json({ error: error?.message || 'Lỗi tính toán cấn trừ' });
    }
  },

};