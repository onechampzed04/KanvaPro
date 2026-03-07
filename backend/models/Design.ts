export type DesignType = 'presentation' | 'social_media' | 'poster' | 'video' | 'infographic' | 'document' | 'website';

export interface Design {
  id: string;
  user_id: string;
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
  is_deleted: boolean;
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
  transition?: any;
}

export interface DesignElement {
  id: string;
  page_id: string;
  element_type: 'text' | 'image' | 'shape' | 'video_clip' | 'audio_clip' | 'line' | 'sticker' | 'frame' | 'group' | 'embed';
  z_index: number;
  locked: boolean;
  visible: boolean;
  properties: any;
}
