// backend/routes/paymentRoutes.ts
import express from 'express';
import { paymentController } from '../controllers/paymentController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// 1. Tạo link thanh toán - chỉ user đã đăng nhập
router.post('/create-checkout', authenticate, paymentController.createCheckout);

// 1b. Tạo link thanh toán gói AI Token
router.post('/create-token-checkout', authenticate, paymentController.createTokenCheckout);

// 2. Verify giao dịch chủ động (frontend gọi sau khi PayOS redirect về)
router.get('/verify', authenticate, paymentController.verifyPayment);

// 3. Webhook từ PayOS (không gắn auth - PayOS gọi từ bên ngoài)
router.post('/webhook', paymentController.payosWebhook);

// 4. Lịch sử thanh toán (bao gồm cả Pending để user tự kiểm tra)
router.get('/history', authenticate, paymentController.getBillingHistory);

// 5. User tự đối soát giao dịch đang Pending với PayOS
//    Gọi khi bấm nút "Tôi đã chuyển khoản - Kiểm tra lại"
router.get('/verify-order', authenticate, paymentController.verifyByOrderCode);

// 6. Preview cấn trừ (Proration) trước khi xác nhận mua gói mới
//    Frontend gọi khi user chọn gói để hiện Modal tạm tính
router.get('/preview-upgrade', authenticate, paymentController.previewUpgrade);


export default router;