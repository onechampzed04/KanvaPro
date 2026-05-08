// backend/src/routes/subscriptionRoute.ts
import express from 'express';
import { subscriptionController } from '../controllers/subscriptionController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// Lấy danh sách (Admin lấy tất cả)
router.get('/', subscriptionController.getAll);

// Lấy chi tiết 1 gói
router.get('/:id', subscriptionController.getById);

// Các thao tác Thêm, Sửa, Xóa yêu cầu đăng nhập (Lý tưởng nhất là thêm adminMiddleware vào đây)
router.post('/', authenticate, subscriptionController.create);
router.put('/:id', authenticate, subscriptionController.update);
router.delete('/:id', authenticate, subscriptionController.delete);

export default router;