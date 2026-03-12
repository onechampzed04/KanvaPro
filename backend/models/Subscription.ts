import { SubscriptionStatus, PaymentStatus } from './enums';

export interface SubscriptionPlan {
    id: string;
    name: string; // Free, Pro, Business...
    slug: string;
    monthly_price: number;
    yearly_price: number;
    max_storage_gb?: number;
    max_team_members?: number;
    features: string[]; // JSONB lưu mảng các tính năng
    is_active: boolean;
    created_at: Date;
}

export interface UserSubscription {
    id: string;
    user_id: string;
    plan_id: string;
    status: SubscriptionStatus;
    current_period_start: Date;
    current_period_end: Date;
    cancel_at?: Date;
    stripe_subscription_id?: string;
    created_at: Date;
    updated_at: Date;
}

export interface Payment {
    id: string;
    user_id: string;
    subscription_id?: string;
    amount: number;
    currency: string; // Mặc định 'VND'
    status: PaymentStatus;
    gateway?: string; // stripe, vnpay, momo
    transaction_id?: string;
    metadata?: Record<string, any>; // JSONB
    created_at: Date;
}