export enum UserRole {
    USER = 'user',
    ADMIN = 'admin',
    MODERATOR = 'moderator'
}

export enum SubscriptionStatus {
    TRIALING = 'trialing',
    ACTIVE = 'active',
    PAST_DUE = 'past_due',
    CANCELED = 'canceled',
    EXPIRED = 'expired'
}

export enum AssetType {
    IMAGE = 'image',
    ICON = 'icon',
    VIDEO = 'video',
    AUDIO = 'audio',
    ILLUSTRATION = 'illustration',
    FONT = 'font',
    TEMPLATE = 'template',
    BACKGROUND = 'background',
    STICKER = 'sticker'
}

export enum DesignType {
    PRESENTATION = 'presentation',
    SOCIAL_MEDIA = 'social_media',
    POSTER = 'poster',
    VIDEO = 'video',
    INFOGRAPHIC = 'infographic',
    DOCUMENT = 'document',
    WEBSITE = 'website',
    PRINT = 'print',
    WHITEBOARD = 'whiteboard',
    OTHER = 'other'
}

export enum ElementType {
    TEXT = 'text',
    IMAGE = 'image',
    SHAPE = 'shape',
    VIDEO_CLIP = 'video_clip',
    AUDIO_CLIP = 'audio_clip',
    LINE = 'line',
    STICKER = 'sticker',
    FRAME = 'frame',
    GROUP = 'group',
    EMBED = 'embed'
}

export enum ShareRole {
    OWNER = 'owner',
    EDITOR = 'editor',
    COMMENTER = 'commenter',
    VIEWER = 'viewer'
}

export enum TeamRole {
    OWNER = 'owner',
    ADMIN = 'admin',
    MEMBER = 'member',
    VIEWER = 'viewer'
}

export enum PaymentStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
    REFUNDED = 'refunded'
}

export enum PageType {
    CANVAS = 'canvas',
    DOC = 'doc',
    SHEET = 'sheet',
}