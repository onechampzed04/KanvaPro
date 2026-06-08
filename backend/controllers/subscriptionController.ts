// backend/src/controllers/subscriptionController.ts
import { Request, Response } from 'express';
import { subscriptionService } from '../services/subscriptionService';

export const subscriptionController = {
  getAll: async (req: Request, res: Response) => {
    try {
      const plans = await subscriptionService.getActivePlans();
      res.json({ plans });
    } catch (error) {
      res.status(500).json({ error: 'Lỗi khi lấy danh sách gói cước' });
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const plan = await subscriptionService.getPlanById(req.params.id);
      if (!plan) return res.status(404).json({ error: 'Không tìm thấy gói cước' });
      res.json({ plan });
    } catch (error) {
      res.status(500).json({ error: 'Lỗi khi lấy thông tin gói cước' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const newPlan = await subscriptionService.createPlan(req.body);
      res.status(201).json({ message: 'Tạo gói thành công', plan: newPlan });
    } catch (error: any) {
      // Xử lý lỗi trùng Slug
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Slug (mã định danh) đã tồn tại' });
      }
      res.status(500).json({ error: 'Lỗi khi tạo gói cước mới' });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const updatedPlan = await subscriptionService.updatePlan(req.params.id, req.body);
      if (!updatedPlan) return res.status(404).json({ error: 'Không tìm thấy gói cước để cập nhật' });
      res.json({ message: 'Cập nhật thành công', plan: updatedPlan });
    } catch (error) {
      res.status(500).json({ error: 'Lỗi khi cập nhật gói cước' });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const deletedPlan = await subscriptionService.deletePlan(req.params.id);
      if (!deletedPlan) return res.status(404).json({ error: 'Không tìm thấy gói cước để xóa' });
      res.json({ message: 'Đã ẩn (xóa) gói cước thành công', plan: deletedPlan });
    } catch (error) {
      res.status(500).json({ error: 'Lỗi khi xóa gói cước' });
    }
  }
};