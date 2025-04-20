export type ChunkMetadata = {
    videoId: string;
    title?: string;
    channelTitle?: string;
    description?: string;
    thumbnailUrl?: string;
    publishedAt?: string | Date;
    keywords?: string[];
    lengthSeconds?: number;
    viewCount?: number | string;
    level: 'fine' | 'medium' | 'large';
    startOffset?: number;
    endOffset?: number;
    summary?: string; // Added for medium chunks
  };