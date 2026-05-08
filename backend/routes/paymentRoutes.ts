// backend/routes/paymentRoutes.ts
import express from 'express';
import { paymentController } from '../controllers/paymentController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// 1. Tạo link thanh toán - chỉ user đã đăng nhập
router.post('/create-checkout', authenticate, paymentController.createCheckout);

// 2. Verify giao dịch chủ động (frontend gọi sau khi PayOS redirect về)
//    Cần authenticate vì chỉ user của giao dịch đó mới nên gọi
router.get('/verify', authenticate, paymentController.verifyPayment);

// 3. Webhook từ PayOS (không gắn auth - PayOS gọi từ bên ngoài)
router.post('/webhook', paymentController.payosWebhook);

export default router;