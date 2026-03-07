export type AssetType = 'image' | 'icon' | 'video' | 'audio' | 'illustration' | 'font' | 'template' | 'background';

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
  uploaded_by?: string;
  metadata?: any;
  created_at: Date;
}
