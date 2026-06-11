import db from '../config/db';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { PayOS } from '@payos/node';
import {
  calculateAddSeatsProration,
  calculateChangePlanProration,
  MIN_PAYMENT_AMOUNT,
} from '../utils/prorataUtils';

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
  // SQL Transaction: đảm bảo atomicity và chống Race Condition (Row-level Lock)
  await db.query('BEGIN');

  try {
    // Tìm payment đang pending trong DB kèm khóa FOR UPDATE
    const paymentResult = await db.query(
      `SELECT id, user_id, metadata FROM payments WHERE transaction_id = $1 AND status = 'pending' FOR UPDATE`,
      [orderCode]
    );

    if (paymentResult.rows.length === 0) {
      // Không có pending payment → có thể đã xử lý rồi hoặc không tồn tại
      await db.query('ROLLBACK');
      return false;
    }

    const payment = paymentResult.rows[0];
    const userId = payment.user_id;
    const paymentId = payment.id;

    // Lấy thông tin từ metadata JSONB
    const metadata = payment.metadata || {};
    const planId = metadata.planId;
    const planName = metadata.planName;
    const membersCount = metadata.membersCount;
    const inviteEmails = metadata.inviteEmails || [];
    const targetTeamId = metadata.teamId || null; // [FIX] teamId cụ thể để gia hạn đúng nhóm

    // [FIX Vấn đề 7] Chỉ lấy subscription đang active để tránh logic sai
    // khi user có subscription đã expired từ trước.
    const subCheck = await db.query(
      `SELECT id, plan_id, current_period_end FROM user_subscriptions
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    let subscriptionId: string;

    if (subCheck.rows.length > 0) {
      // A. ĐÃ TỪNG MUA
      const currentSub = subCheck.rows[0];
      const isStillActive = new Date(currentSub.current_period_end) > new Date();
      // isRenewal = cùng gói (dù đang active hay đã expired đều gia hạn, không đổi gói)
      const isRenewal = currentSub.plan_id === planId;

      if (isRenewal) {
        const teamRes = await db.query(
          `SELECT max_members FROM teams WHERE owner_id = $1 AND max_members > 1 AND is_deleted = false ORDER BY max_members DESC LIMIT 1`,
          [userId]
        );
        const currentMaxMembers = teamRes.rows.length > 0 ? teamRes.rows[0].max_members : 1;

        if (membersCount && membersCount > currentMaxMembers && isStillActive) {
          // Mua thêm chỗ (Add seats): Không tăng thời gian, chỉ update status
          const updateSub = await db.query(
            `UPDATE user_subscriptions
             SET status = 'active',
                 updated_at = NOW()
             WHERE user_id = $1
             RETURNING id`,
            [userId]
          );
          subscriptionId = updateSub.rows[0].id;
        } else {
          // Gia hạn cùng gói:
          // - Nếu còn hạn: cộng dồn 1 tháng từ ngày hết hạn cũ
          // - Nếu đã hết hạn: bắt đầu lại từ NOW()
          const newEndExpr = isStillActive
            ? `current_period_end + INTERVAL '1 month'`
            : `NOW() + INTERVAL '1 month'`;

          const updateSub = await db.query(
            `UPDATE user_subscriptions
             SET status = 'active',
                 current_period_end = ${newEndExpr},
                 cancel_at = NULL,
                 updated_at = NOW()
             WHERE user_id = $1
             RETURNING id`,
            [userId]
          );
          subscriptionId = updateSub.rows[0].id;
        }
      } else {
        // Đổi gói / Nâng cấp / Hạ cấp: Tính kỳ hạn mới dựa trên tổng giá trị (Tiền thực trả + Tiền cấn trừ)
        const deductionValue = metadata.deductionValue || 0;
        const newPlanRes = await db.query(`SELECT monthly_price FROM subscription_plans WHERE id = $1`, [planId]);
        const newPlanPrice = Number(newPlanRes.rows[0]?.monthly_price || 0);
        const newTotal = newPlanPrice * (membersCount || 1);

        let daysToAdd = 30; // Mặc định 1 tháng
        if (newTotal > 0) {
          const dailyRate = newTotal / 30;                   // VNĐ/ngày
          const paymentAmount = Number(payment.amount);
          const totalValue = paymentAmount + Number(deductionValue);
          const raw = Math.floor(totalValue / dailyRate);
          // Guard: NaN, Infinity hoặc âm → fallback 30; max 3650 ngày (~10 năm)
          daysToAdd = Number.isFinite(raw) && raw > 0
            ? Math.min(raw, 3650)
            : 30;
        }
        console.log(`[Subscription] daysToAdd = ${daysToAdd}`);

        const updateSub = await db.query(
          // Dùng make_interval để tránh lỗi kiểu khi nhân INTERVAL với số JS
          `UPDATE user_subscriptions
           SET plan_id = $1,
               status = 'active',
               current_period_start = NOW(),
               current_period_end = NOW() + make_interval(days => $2::int),
               cancel_at = NULL,
               updated_at = NOW()
           WHERE user_id = $3
           RETURNING id`,
          [planId, daysToAdd, userId]
        );
        subscriptionId = updateSub.rows[0].id;
      }
    } else {
      // B. CHƯA TỪNG MUA → INSERT mới (1 month)
      const insertSub = await db.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 month')
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

    // D. Xử lý tạo Workspace tương ứng với gói (Cá nhân hoặc Team)
    // [FIX] Nhận diện Team Plan qua số lượng ghế mua, email mời, hoặc tên gói có chữ "Team"
    const isTeamPlan = inviteEmails.length > 0 || (membersCount && membersCount > 1) || (planName && planName.toLowerCase().includes('team'));

    if (isTeamPlan) {
      // [FIX - Renew Team] Ưu tiên dùng teamId từ metadata nếu có (user bấm Gia Hạn trên trang Teams).
      // Fallback về SELECT LIMIT 1 nếu không có teamId (lường trường hợp cũ / Pricing page).
      let teamIdToUse: string;

      if (targetTeamId) {
        // Xác minh teamId này thực sự thuộc về userId và chưa bị xóa
        const teamVerify = await db.query(
          `SELECT id FROM teams WHERE id = $1 AND owner_id = $2 AND is_deleted = false`,
          [targetTeamId, userId]
        );
        if (teamVerify.rows.length === 0) {
          // teamId giả mạo hoặc không thuộc user này → fallback
          console.warn(`[Payment] targetTeamId ${targetTeamId} không hợp lệ cho user ${userId}, fallback SELECT LIMIT 1`);
          const fallbackRes = await db.query(
            `SELECT id FROM teams WHERE owner_id = $1 AND max_members > 1 AND is_deleted = false ORDER BY max_members DESC LIMIT 1`,
            [userId]
          );
          teamIdToUse = fallbackRes.rows[0]?.id;
        } else {
          teamIdToUse = targetTeamId;
        }
      } else {
        // Fallback cũ: tìm team lớn nhất
        const existingTeamRes = await db.query(
          `SELECT id FROM teams WHERE owner_id = $1 AND max_members > 1 AND is_deleted = false ORDER BY max_members DESC LIMIT 1`,
          [userId]
        );
        teamIdToUse = existingTeamRes.rows[0]?.id;
      }

      if (!teamIdToUse) {
        // Chưa có team nào → tạo mới
        teamIdToUse = crypto.randomUUID();
        const defaultTeamName = `Kanva Team của ${userId.substring(0, 5)}`;
        const teamMaxMembers = membersCount && membersCount > 0 ? membersCount : 1;
        await db.query(
          `INSERT INTO teams (id, name, owner_id, max_members, is_deleted, created_at, updated_at)
           VALUES ($1, $2, $3, $4, false, NOW(), NOW())`,
          [teamIdToUse, defaultTeamName, userId, teamMaxMembers]
        );
        await db.query(
          `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'owner')`,
          [crypto.randomUUID(), teamIdToUse, userId]
        );
        console.log(`✅ [Team] Tạo Team mới ${teamIdToUse} cho user ${userId}`);
      } else {
        // Cập nhật max_members nếu cần
        if (membersCount && membersCount > 1) {
          await db.query(
            `UPDATE teams SET max_members = $1 WHERE id = $2`,
            [membersCount, teamIdToUse]
          );
        }
      }

      if (inviteEmails.length > 0) {
        console.log(`📧 [Team] Cần gửi lời mời đến: ${inviteEmails.join(', ')}`);
      }
    } else {
      // Nếu là gói cá nhân (membersCount = 1), kiểm tra xem user đã có Personal Workspace chưa
      const existingPersonalRes = await db.query(
        `SELECT id FROM teams WHERE owner_id = $1 AND max_members = 1 AND is_deleted = false LIMIT 1`,
        [userId]
      );
      
      if (existingPersonalRes.rows.length === 0) {
        // Tạo Personal Workspace
        const personalTeamId = crypto.randomUUID();
        const userNameRes = await db.query(`SELECT name FROM users WHERE id = $1`, [userId]);
        const userName = userNameRes.rows[0]?.name || 'Cá nhân';
        const personalTeamName = `Không gian của ${userName}`;
        
        await db.query(
          `INSERT INTO teams (id, name, owner_id, max_members, is_deleted, created_at, updated_at)
           VALUES ($1, $2, $3, 1, false, NOW(), NOW())`,
          [personalTeamId, personalTeamName, userId]
        );
        
        // Thêm Owner vào nhóm
        await db.query(
          `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'owner')`,
          [crypto.randomUUID(), personalTeamId, userId]
        );
        console.log(`✅ [Workspace] Đã tự động tạo Personal Workspace mới ${personalTeamId} cho user ${userId}`);
      }
    }

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
  // [FIX Vấn đề 3] Bỏ tham số `amount` — giá được tính 100% từ DB, không nhận từ client.
  // =========================================================================
  createPaymentLink: async (userId: string, planId: string, planName: string, membersCount?: number, inviteEmails?: string[], teamId?: string) => {
    // 1. Lấy thông tin gói mới từ DB để đảm bảo giá chính xác và gói đang active
    const newPlanRes = await db.query(
      `SELECT name, monthly_price FROM subscription_plans WHERE id = $1 AND is_active = true`,
      [planId]
    );
    if (newPlanRes.rows.length === 0) throw new Error('Gói cước không tồn tại hoặc đã ngừng bán');

    const newPlan = newPlanRes.rows[0];
    let finalAmount = Number(newPlan.monthly_price);

    // [SECURITY FIX - Fractional Seats Injection]
    // Ép về số nguyên dương. Chặn trick gửi membersCount = 0.005 để giảm 99.5% giá.
    // Math.floor(0.005) = 0 → fallback về 1. Math.floor(2.9) = 2 (cũng an toàn).
    const rawCount = typeof membersCount === 'number' ? membersCount : 1;
    const count = Math.max(1, Math.floor(rawCount));
    finalAmount = finalAmount * count;
    // [FIX Vấn đề 1] Dùng crypto.randomInt để sinh OrderCode ngẫu nhiên thực sự.
    // Tránh trường hợp 2 request cùng ms có cùng Date.now() → trùng orderCode.
    // Phạm vi 10_000_000 – 999_999_999 đảm bảo luôn đủ 9 chữ số (PayOS yêu cầu số nguyên dương).
    const orderCode = crypto.randomInt(10_000_000, 999_999_999);

    // 2. Tính toán Proration (Cấn trừ) nếu user đang có gói cũ còn hạn
    const currentSubRes = await db.query(
      `SELECT us.plan_id, us.current_period_end, sp.monthly_price, sp.name,
              (SELECT max_members FROM teams WHERE owner_id = $1 AND max_members > 1 AND is_deleted = false ORDER BY max_members DESC LIMIT 1) as current_max_members
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
        const remainingMs = endDate.getTime() - now.getTime();
        const remainingDays = remainingMs / (1000 * 60 * 60 * 24);

        if (currentSub.plan_id === planId) {
          const currentMembersCount = currentSub.current_max_members ? Number(currentSub.current_max_members) : 1;
          if (count > currentMembersCount) {
            // [FIX Vấn đề 2] Dùng shared util calculateAddSeatsProration()
            const newSeats = count - currentMembersCount;
            const proration = calculateAddSeatsProration(
              Number(newPlan.monthly_price), newSeats, remainingDays,
            );
            finalAmount = proration.finalAmount;
            deductionValue = proration.deductionValue;
            description = `Them cho ${planName}`.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 25);
          } else {
            // Gia hạn cùng gói: Không cấn trừ tiền, cộng dồn ngày
            description = `Gia han ${planName}`.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 25);
          }
        } else {
          // [FIX Vấn đề 2] Dùng shared util calculateChangePlanProration()
          const baseCurrentPrice = Number(currentSub.monthly_price);
          const currentMembersCount = currentSub.current_max_members ? Number(currentSub.current_max_members) : 1;
          const currentPlanValue = baseCurrentPrice * currentMembersCount;

          const proration = calculateChangePlanProration(
            Number(newPlan.monthly_price), count, currentPlanValue, remainingDays,
          );
          finalAmount = proration.finalAmount;
          deductionValue = proration.deductionValue;
          description = (proration.finalAmount <= MIN_PAYMENT_AMOUNT
            ? `Ha cap ${planName}`
            : `Nang cap ${planName}`
          ).replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 25);
          console.log(`[Proration] User ${userId} đổi gói → Cấn trừ: ${deductionValue} VNĐ, Thu: ${finalAmount} VNĐ`);
        }
      }
    }

    const metadata = JSON.stringify({ planId, planName, deductionValue, originalAmount: Number(newPlan.monthly_price), membersCount: count, inviteEmails, teamId: teamId || null });

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

    // [FIX Vấn đề 4] Timeout 10s khi gọi PayOS. Nếu vượt quá → xóa record pending
    // để tránh "giao dịch ma" tồn tại vĩnh viễn trong DB.
    const PAYOS_TIMEOUT_MS = 10_000;
    try {
      const paymentLinkRes = await Promise.race([
        payos.paymentRequests.create(body),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PAYOS_TIMEOUT')), PAYOS_TIMEOUT_MS)
        ),
      ]) as any;
      return paymentLinkRes.checkoutUrl;
    } catch (error: any) {
      // Xóa record pending để không để lại giao dịch ma
      await db.execute(
        `DELETE FROM payments WHERE transaction_id = $1 AND status = 'pending'`,
        [orderCode.toString()]
      );
      if (error?.message === 'PAYOS_TIMEOUT') {
        console.error('[PayOS] Request timed out after 10s. Pending record cleaned up.');
        throw new Error('Cổng thanh toán không phản hồi. Vui lòng thử lại sau.');
      }
      console.error('[PayOS] Lỗi tạo link:', error);
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
  previewUpgrade: async (userId: string, newPlanId: string, targetMembersCount?: number) => {
    const newPlanRes = await db.query(
      `SELECT id, name, monthly_price FROM subscription_plans WHERE id = $1 AND is_active = true`,
      [newPlanId]
    );
    if (newPlanRes.rows.length === 0) throw new Error('Gói cước không tồn tại hoặc không còn hiệu lực');

    const newPlan = newPlanRes.rows[0];
    const count = targetMembersCount && targetMembersCount > 0 ? targetMembersCount : 1;
    const originalAmount = Number(newPlan.monthly_price) * count;
    let deductionValue = 0;
    let finalAmount = originalAmount;
    let originalAmountForUI = originalAmount;
    let currentPlanName: string | null = null;
    let remainingDays = 0;

    const currentSubRes = await db.query(
      `SELECT us.plan_id, us.current_period_end, sp.monthly_price, sp.name, us.cancel_at,
              (SELECT max_members FROM teams WHERE owner_id = $1 AND max_members > 1 AND is_deleted = false ORDER BY max_members DESC LIMIT 1) as current_max_members
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
        const remainingDaysExact = remainingMs / (1000 * 60 * 60 * 24);

        const baseCurrentPrice = Number(currentSub.monthly_price);
        const currentMembersCount = currentSub.current_max_members ? Number(currentSub.current_max_members) : 1;
        const currentPlanValue = baseCurrentPrice * currentMembersCount;

        if (currentSub.plan_id === newPlanId) {
          if (count > currentMembersCount) {
            // [FIX Vấn đề 2] Dùng shared util calculateAddSeatsProration()
            const newSeats = count - currentMembersCount;
            originalAmountForUI = newSeats * Number(newPlan.monthly_price);
            const proration = calculateAddSeatsProration(
              Number(newPlan.monthly_price), newSeats, remainingDaysExact,
            );
            finalAmount = proration.finalAmount;
            deductionValue = proration.deductionValue;
          } else {
            // Gia hạn: Không cấn trừ
            deductionValue = 0;
            finalAmount = originalAmount;
          }
        } else {
          // [FIX Vấn đề 2] Dùng shared util calculateChangePlanProration()
          const proration = calculateChangePlanProration(
            Number(newPlan.monthly_price), count, currentPlanValue, remainingDaysExact,
          );
          finalAmount = proration.finalAmount;
          deductionValue = proration.deductionValue;
        }
      }
    }

    if (finalAmount < 2000) finalAmount = 2000; // PayOS tối thiểu 2,000 VNĐ

    return {
      newPlanName: newPlan.name,
      originalAmount: originalAmountForUI, // Giá gốc (có thể là chỉ cho số chỗ mới)
      deductionValue,        // Số tiền được cấn trừ từ gói cũ
      finalAmount,           // Số tiền thực tế phải trả
      currentPlanName,       // Tên gói cũ (null nếu chưa có gói)
      remainingDays,         // Số ngày còn lại của gói cũ
    };
  },

};