import { TeamRole } from './enums';

export interface Team {
    id: string;
    name: string;
    avatar_url?: string;
    owner_id: string; // UUID của User
    max_members: number;
    created_at: Date;
    updated_at: Date;
}

export interface TeamMember {
    id: string;
    team_id: string;
    user_id: string;
    role: TeamRole;
    created_at: Date;
}