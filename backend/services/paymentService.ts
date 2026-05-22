import db from '../config/db';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { PayOS } from '@payos/node';

dotenv.config();

// SDK v2: constructor nhận options object thay vì 3 tham số riêng lẻ
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID!,
  apiKey: process.env.PAYOS_API_KEY!,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY!,
});

// =========================================================================
// Logic cốt lõi: Kích hoạt subscription sau khi xác nhận giao dịch thành công
// Được dùng chung bởi cả Webhook lẫn Verify endpoint
// =========================================================================
async function activateSubscription(orderCode: string): Promise<boolean> {
  // Tìm payment đang pending trong DB
  const paymentResult = await db.query(
    `SELECT id, user_id, metadata FROM payments WHERE transaction_id = $1 AND status = 'pending'`,
    [orderCode]
  );

  if (paymentResult.rows.length === 0) {
    // Không có pending payment → có thể đã xử lý rồi hoặc không tồn tại
    return false;
  }

  const payment = paymentResult.rows[0];
  const userId = payment.user_id;
  const paymentId = payment.id;

  // Lấy planId từ cột metadata JSONB
  const planId = payment.metadata?.planId;
  const planName = payment.metadata?.planName;

  // SQL Transaction: đảm bảo atomicity
  await db.query('BEGIN');

  try {
    // Kiểm tra user đã từng mua gói chưa
    const subCheck = await db.query(
      `SELECT id FROM user_subscriptions WHERE user_id = $1`,
      [userId]
    );

    let subscriptionId: string;

    if (subCheck.rows.length > 0) {
      // A. ĐÃ TỪNG MUA → UPDATE (gia hạn thêm 30 ngày)
      const updateSub = await db.query(
        `UPDATE user_subscriptions
         SET plan_id = $1,
             status = 'active',
             current_period_start = NOW(),
             current_period_end = NOW() + INTERVAL '30 days',
             updated_at = NOW()
         WHERE user_id = $2
         RETURNING id`,
        [planId, userId]
      );
      subscriptionId = updateSub.rows[0].id;
    } else {
      // B. CHƯA TỪNG MUA → INSERT mới (30 ngày)
      const insertSub = await db.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '30 days')
         RETURNING id`,
        [userId, planId]
      );
      subscriptionId = insertSub.rows[0].id;
    }

    // C. Cập nhật payment thành 'succeeded' và liên kết subscription_id
    await db.query(
      `UPDATE payments SET status = 'succeeded', subscription_id = $1 WHERE id = $2`,
      [subscriptionId, paymentId]
    );

    await db.query('COMMIT');
    console.log(`✅ [Payment] Kích hoạt thành công! User ${userId} đã lên gói ${planName}.`);
    return true;

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('❌ Lỗi DB transaction, đã rollback:', err);
    throw err;
  }
}

export const paymentService = {
  // =========================================================================
  // Hàm 1: Tạo link thanh toán khi user bấm "Mua gói"
  // =========================================================================
  createPaymentLink: async (userId: string, planId: string, amount: number, planName: string) => {
    // 1. Lấy thông tin gói mới từ DB để đảm bảo giá chính xác
    const newPlanRes = await db.query(
      `SELECT name, monthly_price FROM subscription_plans WHERE id = $1`,
      [planId]
    );
    if (newPlanRes.rows.length === 0) throw new Error('Gói cước không tồn tại');

    const newPlan = newPlanRes.rows[0];
    let finalAmount = Number(newPlan.monthly_price);
    const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 1000));

    // 2. Tính toán Proration (Cấn trừ) nếu user đang có gói cũ còn hạn
    const currentSubRes = await db.query(
      `SELECT us.current_period_end, sp.monthly_price, sp.name
       FROM user_subscriptions us 
       JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1 AND us.status = 'active'`,
      [userId]
    );

    let description = `Mua goi ${planName}`.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 25);
    let deductionValue = 0;

    if (currentSubRes.rows.length > 0) {
      const currentSub = currentSubRes.rows[0];
      const endDate = new Date(currentSub.current_period_end);
      const now = new Date();

      if (endDate > now) {
        // Tính số ngày còn dư
        const remainingMs = endDate.getTime() - now.getTime();
        const remainingDays = remainingMs / (1000 * 60 * 60 * 24);

        // Quy ra tiền (Giả định 1 tháng = 30 ngày)
        const currentPlanPrice = Number(currentSub.monthly_price);
        deductionValue = Math.floor((remainingDays / 30) * currentPlanPrice);

        // Fix bug tháng 31 ngày: Không cho phép tiền cấn trừ vượt quá giá gốc của gói cũ
        if (deductionValue > currentPlanPrice) {
          deductionValue = currentPlanPrice;
        }

        if (deductionValue > 0) {
          finalAmount = finalAmount - deductionValue;
          // PayOS yêu cầu amount > 0, nên nếu cấn trừ xong còn quá ít, ta để tối thiểu 2000đ
          if (finalAmount < 2000) {
            finalAmount = 2000;
          }
          description = `Nang cap ${planName}`.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 25);
          console.log(`[Proration] User ${userId} nâng cấp. Giá: ${newPlan.monthly_price}, Cấn trừ: ${deductionValue} -> Thu: ${finalAmount}`);
        }
      }
    }

    const metadata = JSON.stringify({ planId, planName, deductionValue, originalAmount: Number(newPlan.monthly_price) });

    // Lưu record 'pending' vào DB TRƯỚC khi gọi PayOS
    await db.query(
      `INSERT INTO payments (id, user_id, amount, status, gateway, transaction_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [crypto.randomUUID(), userId, finalAmount, 'pending', 'payos', orderCode.toString(), metadata]
    );

    const body = {
      orderCode,
      amount: finalAmount,
      description,
      returnUrl: `${process.env.FRONTEND_URL}/payment/success`,
      cancelUrl: `${process.env.FRONTEND_URL}/payment/cancel`,
    };

    try {
      const paymentLinkRes = await payos.paymentRequests.create(body);
      return paymentLinkRes.checkoutUrl;
    } catch (error) {
      console.error('Lỗi tạo link PayOS:', error);
      throw new Error('Không thể tạo link thanh toán');
    }
  },

  // =========================================================================
  // Hàm 2: Verify chủ động — Frontend gọi sau khi PayOS redirect về success page
  // Đây là giải pháp thay thế webhook cho môi trường localhost (không public)
  // =========================================================================
  verifyAndActivate: async (orderCode: string) => {
    // 1. Hỏi thẳng PayOS: trạng thái đơn hàng này là gì?
    const paymentInfo = await payos.paymentRequests.get(orderCode);
    console.log(`[Verify] orderCode=${orderCode} status=${(paymentInfo as any).status}`);

    // PayOS trả về status = 'PAID' khi đã thanh toán thành công
    if ((paymentInfo as any).status !== 'PAID') {
      return { success: false, message: 'Giao dịch chưa được thanh toán' };
    }

    // 2. Kích hoạt subscription trong DB
    const activated = await activateSubscription(orderCode);

    if (!activated) {
      // Có thể đã được xử lý trước đó (webhook kịp về hoặc gọi verify 2 lần)
      return { success: true, message: 'Giao dịch đã được xử lý trước đó' };
    }

    return { success: true, message: 'Kích hoạt gói thành công' };
  },

  // =========================================================================
  // Hàm 3: Xử lý Webhook từ PayOS (dùng khi deploy production với public URL)
  // =========================================================================
  handleWebhook: async (webhookData: any) => {
    try {
      // Xác thực chữ ký — SDK v2
      const verifiedData = payos.webhooks.verify(webhookData);

      if ((verifiedData as any).code === '00' && (verifiedData as any).data?.orderCode) {
        const orderCode = (verifiedData as any).data.orderCode.toString();
        await activateSubscription(orderCode);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Lỗi xử lý Webhook PayOS:', error);
      throw error;
    }
  },

  // =========================================================================
  // Hàm 4: Admin duyệt tay giao dịch bị treo (Force Activate)
  // Admin đã xác nhận tiền về tài khoản thật, kích hoạt gói bằng payment DB id
  // =========================================================================
  forceActivateByPaymentId: async (paymentDbId: string) => {
    // Lấy payment record theo UUID trong DB (không phải orderCode)
    const paymentRes = await db.query(
      `SELECT id, user_id, metadata, transaction_id, status FROM payments WHERE id = $1`,
      [paymentDbId]
    );
    if (paymentRes.rows.length === 0) throw new Error('Không tìm thấy giao dịch');

    const payment = paymentRes.rows[0];
    if (payment.status === 'succeeded') {
      return { success: true, message: 'Giao dịch này đã được xử lý trước đó' };
    }

    // Dùng lại hàm activateSubscription nội bộ thông qua transaction_id (orderCode)
    const activated = await activateSubscription(payment.transaction_id);
    if (!activated) {
      // Trường hợp payment không còn pending (đã xử lý song song) — vẫn coi là OK
      return { success: true, message: 'Giao dịch đã được xử lý trước đó' };
    }
    return { success: true, message: `Đã kích hoạt gói thành công cho user ${payment.user_id}` };
  },

  // =========================================================================
  // Hàm 5: User tự bấm "Tôi đã chuyển khoản" — hỏi lại PayOS theo orderCode
  // Dùng cho BillingPage: các đơn Pending có nút "Kiểm tra lại"
  // =========================================================================
  verifyByOrderCode: async (orderCode: string) => {
    // Hỏi PayOS trạng thái thực tế
    let paymentInfo: any;
    try {
      paymentInfo = await payos.paymentRequests.get(orderCode);
    } catch (err) {
      console.error('[VerifyByOrderCode] Lỗi gọi PayOS API:', err);
      throw new Error('Không thể kết nối PayOS để kiểm tra. Vui lòng thử lại sau.');
    }

    console.log(`[VerifyByOrderCode] orderCode=${orderCode} payosStatus=${paymentInfo?.status}`);

    if (paymentInfo?.status !== 'PAID') {
      return {
        success: false,
        status: paymentInfo?.status || 'UNKNOWN',
        message: 'PayOS chưa ghi nhận thanh toán thành công. Vui lòng đợi thêm vài phút.',
      };
    }

    const activated = await activateSubscription(orderCode);
    if (!activated) {
      return { success: true, message: 'Giao dịch đã được xử lý trước đó. Gói của bạn đã được kích hoạt.' };
    }
    return { success: true, message: 'Xác nhận thành công! Gói Pro đã được kích hoạt.' };
  },

  // =========================================================================
  // Hàm 6: Preview cấn trừ (Proration Preview) — không tạo link, chỉ tính tiền
  // Frontend gọi trước khi hiện Modal xác nhận mua gói mới
  // =========================================================================
  previewUpgrade: async (userId: string, newPlanId: string) => {
    const newPlanRes = await db.query(
      `SELECT id, name, monthly_price FROM subscription_plans WHERE id = $1 AND is_active = true`,
      [newPlanId]
    );
    if (newPlanRes.rows.length === 0) throw new Error('Gói cước không tồn tại hoặc không còn hiệu lực');

    const newPlan = newPlanRes.rows[0];
    const originalAmount = Number(newPlan.monthly_price);
    let deductionValue = 0;
    let currentPlanName: string | null = null;
    let remainingDays = 0;

    // Kiểm tra user có gói cũ đang active không
    const currentSubRes = await db.query(
      `SELECT us.current_period_end, sp.monthly_price, sp.name, us.cancel_at
       FROM user_subscriptions us
       JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1 AND us.status = 'active'`,
      [userId]
    );

    if (currentSubRes.rows.length > 0) {
      const currentSub = currentSubRes.rows[0];
      currentPlanName = currentSub.name;
      const endDate = new Date(currentSub.current_period_end);
      const now = new Date();

      if (endDate > now) {
        const remainingMs = endDate.getTime() - now.getTime();
        remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

        const currentPlanPrice = Number(currentSub.monthly_price);
        // Tính cấn trừ dựa trên số ngày còn lại so với tổng chu kỳ (30 ngày)
        deductionValue = Math.floor((remainingDays / 30) * currentPlanPrice);
        if (deductionValue > currentPlanPrice) deductionValue = currentPlanPrice;
      }
    }

    let finalAmount = originalAmount - deductionValue;
    if (finalAmount < 2000) finalAmount = 2000; // PayOS tối thiểu 2,000 VNĐ

    return {
      newPlanName: newPlan.name,
      originalAmount,        // Giá gốc gói mới
      deductionValue,        // Số tiền được cấn trừ từ gói cũ
      finalAmount,           // Số tiền thực tế phải trả
      currentPlanName,       // Tên gói cũ (null nếu chưa có gói)
      remainingDays,         // Số ngày còn lại của gói cũ
    };
  },

  // =========================================================================
  // Hàm 7: User hủy gia hạn tự động (Cancel at period end)
  // =========================================================================
  cancelAutoRenewal: async (userId: string) => {
    const subRes = await db.query(
      `SELECT id, current_period_end, cancel_at FROM user_subscriptions
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
    if (subRes.rows.length === 0) throw new Error('Không tìm thấy gói đang active');

    const sub = subRes.rows[0];
    if (sub.cancel_at) {
      return {
        success: true,
        message: 'Gói của bạn đã được đánh dấu hủy gia hạn trước đó',
        cancelAt: sub.cancel_at,
      };
    }

    // Đánh dấu hủy vào cuối kỳ — KHÔNG đổi status, user vẫn dùng đến hết ngày
    await db.query(
      `UPDATE user_subscriptions
       SET cancel_at = current_period_end, updated_at = NOW()
       WHERE id = $1`,
      [sub.id]
    );

    return {
      success: true,
      message: 'Đã hủy gia hạn tự động. Gói của bạn vẫn có hiệu lực đến ngày kết thúc.',
      cancelAt: sub.current_period_end,
    };
  },
};