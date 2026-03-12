import { DesignType, ElementType } from './enums';

export interface Design {
    id: string;
    user_id?: string;
    team_id?: string;
    folder_id?: string;
    title: string;
    description?: string;
    design_type: DesignType;
    width: number;
    height: number;
    thumbnail_url?: string;
    is_public: boolean;
    is_template: boolean;
    last_edited_at: Date;
    created_at: Date;
    updated_at: Date;
}

export interface DesignPage {
    id: string;
    design_id: string;
    page_order: number;
    title?: string;
    background_color?: string;
    background_asset_id?: string;
    duration?: number;
    transition?: Record<string, any>; // JSONB {type: "fade", duration: 0.5}
}

// Đây là định nghĩa cho thuộc tính properties cực kỳ linh hoạt của bạn
export interface ElementProperties {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    opacity?: number;
    content?: string; // Cho text
    fontSize?: number;
    asset_id?: string; // Cho image/sticker
    animation?: {
        type: string;
        duration: number;
        delay: number;
    };
    timeline?: {
        start_time: number;
        end_time: number;
        track: number;
    };
    [key: string]: any; // Cho phép thêm các thuộc tính khác
}

export interface DesignElement {
    id: string;
    page_id: string;
    element_type: ElementType;
    z_index: number;
    locked: boolean;
    visible: boolean;
    properties: ElementProperties; // Áp dụng interface trên cho JSONB
    created_at: Date;
    updated_at: Date;
}