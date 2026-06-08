// backend/utils/prorataUtils.ts
// ─── Shared Proration Calculation — Single Source of Truth ────────────────────
//
// Module này tập trung toàn bộ công thức tính cấn trừ (proration) để đảm bảo
// previewUpgrade() và activateSubscription() luôn dùng cùng một logic.
//
// 2 kịch bản chính:
//   A. ADD_SEATS  : Thêm chỗ cùng gói → tính prorated cho số ngày còn lại
//   B. CHANGE_PLAN: Đổi/nâng/hạ cấp gói → cấn trừ giá trị còn lại của gói cũ

export const MIN_PAYMENT_AMOUNT = 2000; // PayOS tối thiểu 2,000 VNĐ

// ─── Kịch bản A: Thêm slot cùng gói (Add Seats) ───────────────────────────────
export interface AddSeatsProration {
  finalAmount: number;      // Số tiền user thực trả (đã floor theo PayOS min)
  deductionValue: number;   // Phần giảm giá (phần tháng đã qua, không thu)
}

/**
 * Tính tiền khi user mua thêm slot cho cùng gói đang dùng.
 *
 * Công thức:
 *   finalAmount = floor(newSeats × pricePerSeat × remainingDays / 30)
 *   deductionValue = (newSeats × pricePerSeat) - finalAmount
 *
 * Tức là: user chỉ trả tiền cho số ngày còn lại trong tháng hiện tại.
 */
export function calculateAddSeatsProration(
  pricePerSeat: number,
  newSeats: number,
  remainingDays: number,
): AddSeatsProration {
  const fullMonthPrice = pricePerSeat * newSeats;
  const rawFinal = Math.floor((remainingDays / 30) * fullMonthPrice);
  const finalAmount = Math.max(rawFinal, MIN_PAYMENT_AMOUNT);
  const deductionValue = fullMonthPrice - rawFinal; // phần không thu (ngày đã qua)
  return { finalAmount, deductionValue };
}

// ─── Kịch bản B: Đổi gói (Change Plan / Upgrade / Downgrade) ──────────────────
export interface ChangePlanProration {
  finalAmount: number;      // Số tiền user thực trả
  deductionValue: number;   // Giá trị cấn trừ từ gói cũ (= tiền còn lại gói cũ)
  daysToAdd: number;        // Số ngày subscription mới (luôn = 30 cho 1 tháng)
}

/**
 * Tính tiền và số ngày khi user đổi sang gói mới.
 *
 * Công thức:
 *   deductionValue = floor(remainingDays / 30 × currentPlanValue)
 *   finalAmount    = newPlanValue - deductionValue  (tối thiểu MIN_PAYMENT_AMOUNT)
 *   daysToAdd      = 30 (luôn cấp đủ 1 tháng cho gói mới)
 *
 * Lưu ý: daysToAdd luôn = 30 vì:
 *   totalValue / dailyRate
 *   = (finalAmount + deductionValue) / (newPlanValue / 30)
 *   = newPlanValue / (newPlanValue / 30)          [vì finalAmount + deduction = newPlanValue trước floor]
 *   = 30
 *
 * Khi finalAmount bị floor lên MIN_PAYMENT_AMOUNT (trường hợp hạ cấp):
 *   Ta vẫn cho 30 ngày vì deductionValue đã bù đắp phần thiếu về mặt nghiệp vụ.
 */
export function calculateChangePlanProration(
  newPricePerSeat: number,
  newSeats: number,
  currentPlanValue: number,
  remainingDays: number,
): ChangePlanProration {
  const newPlanValue = newPricePerSeat * newSeats;
  const deductionValue = Math.floor((remainingDays / 30) * currentPlanValue);
  const rawFinal = newPlanValue - deductionValue;
  const finalAmount = Math.max(rawFinal, MIN_PAYMENT_AMOUNT);
  const daysToAdd = 30; // luôn cấp 1 tháng đầy đủ cho gói mới
  return { finalAmount, deductionValue, daysToAdd };
}
