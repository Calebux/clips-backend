export interface Clip {
  id: string;
  videoId: string;
  /** Start time of the clip in seconds */
  startTime: number;
  /** End time of the clip in seconds */
  endTime: number;
  /** 0.0–1.0 — where in the source video this clip starts (0 = beginning, 1 = end) */
  positionRatio: number;
  /** Transcript text for this clip segment */
  transcript?: string;
  /**
   * Heuristic virality score (0–100).
   * Null until the clip-generation processor runs.
   * Replace with AI-model output once integrated.
   */
  viralityScore: number | null;
  /** Cloudinary secure URL for the clip video */
  clipUrl?: string;
  /** Cloudinary thumbnail URL */
  thumbnail?: string;
  /** Clip processing status: 'pending', 'processing', 'success', 'failed' */
  status?: 'pending' | 'processing' | 'success' | 'failed';
  /** Error message if upload/processing failed */
  error?: string;
  createdAt: Date;
}
