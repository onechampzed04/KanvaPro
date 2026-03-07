export interface User {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
  avatar_url?: string;
  role: 'user' | 'admin' | 'moderator';
  is_verified: boolean;
  storage_used_bytes: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url?: string;
}
