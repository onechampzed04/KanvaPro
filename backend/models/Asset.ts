import { AssetType } from './enums';

export interface Asset {
    id: string;
    name?: string;
    type: AssetType;
    url: string;
    thumbnail_url?: string;
    file_size?: number;
    width?: number;
    height?: number;
    duration?: number;
    is_premium: boolean;
    category_id?: string;
    tags?: string[];
    license?: string;
    uploaded_by?: string; // UUID của user hoặc null nếu là stock
    metadata?: Record<string, any>; // JSONB
    created_at: Date;
}