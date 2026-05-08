// backend/controllers/paymentController.ts
import { Request, Response } from 'express';
import { paymentService } from '../services/paymentService';

export const paymentController = {
  // ----------------------------------------------------------------------
  // 1. Tạo Link Thanh Toán (Khi user bấm nút Mua trên Frontend)
  // ----------------------------------------------------------------------
  createCheckout: async (req: Request, res: Response) => {
    try {
      const { planId, amount, planName } = req.body;
      const userId = (req as any).user.id;

      if (!planId || !amount || !planName) {
        return res.status(400).json({ error: 'Thiếu thông tin gói (planId, amount, planName)' });
      }

      const checkoutUrl = await paymentService.createPaymentLink(userId, planId, amount, planName);
      res.json({ checkoutUrl });
    } catch (error) {
      console.error('Lỗi ở paymentController.createCheckout:', error);
      res.status(500).json({ error: 'Lỗi server khi khởi tạo thanh toán' });
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
  }
};