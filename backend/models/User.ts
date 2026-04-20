import { UserRole } from './enums';

export interface User {
    id: string; // UUID
    email: string;
    password_hash?: string;
    name?: string;
    avatar_url?: string;
    role: UserRole;
    is_verified: boolean;
    last_login_at?: Date;
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
  is_verified: boolean;
}
