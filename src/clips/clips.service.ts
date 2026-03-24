import { Injectable, Logger } from '@nestjs/common';
import { Clip } from './clip.entity';
import { ClipGenerationProcessor, ClipGenerationJob } from './clip-generation.processor';

export type ClipSortField = 'viralityScore' | 'createdAt' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface ListClipsOptions {
  videoId?: string;
  sortBy?: ClipSortField;
  order?: SortOrder;
  statusFilter?: Clip['status'];
}

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);
  /** In-memory store — swap for a TypeORM/Prisma repository when DB is wired up */
  private readonly clips: Clip[] = [];

  constructor(private readonly processor: ClipGenerationProcessor) {}

  async generateClip(job: ClipGenerationJob): Promise<Clip> {
    const clipId = `${job.videoId}-${job.startTime}-${job.endTime}`;
    
    // Log start of generation
    this.logger.log(`Generating clip: ${clipId}`);

    const clip = await this.processor.process(job);
    this.clips.push(clip);

    // Log result
    if (clip.status === 'success') {
      this.logger.log(
        `Clip generated successfully: ${clipId} → ${clip.clipUrl}`,
      );
    } else {
      this.logger.error(
        `Clip generation failed: ${clipId} → ${clip.error}`,
      );
    }

    return clip;
  }

  /**
   * List clips with optional filtering and sorting.
   *
   * sortBy options:
   *   viralityScore (default) — highest viral potential first
   *   createdAt               — newest first by default
   *   duration                — longest first by default
   *
   * statusFilter options:
   *   pending, processing, success, failed
   */
  listClips(options: ListClipsOptions = {}): Clip[] {
    const {
      videoId,
      sortBy = 'viralityScore',
      order = 'desc',
      statusFilter,
    } = options;

    let result = videoId
      ? this.clips.filter((c) => c.videoId === videoId)
      : [...this.clips];

    // Filter by status if provided
    if (statusFilter) {
      result = result.filter((c) => c.status === statusFilter);
    }

    return result.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortBy) {
        case 'viralityScore':
          aVal = a.viralityScore ?? -1;
          bVal = b.viralityScore ?? -1;
          break;
        case 'createdAt':
          aVal = a.createdAt.getTime();
          bVal = b.createdAt.getTime();
          break;
        case 'duration':
          aVal = a.endTime - a.startTime;
          bVal = b.endTime - b.startTime;
          break;
        default:
          return 0;
      }

      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  /**
   * Find clip by ID
   */
  findById(id: string): Clip | undefined {
    return this.clips.find((c) => c.id === id);
  }

  /**
   * Get clips by status (e.g., 'failed' to find clips needing retry)
   */
  getClipsByStatus(status: Clip['status']): Clip[] {
    return this.clips.filter((c) => c.status === status);
  }

  /**
   * Mark clip as failed for manual intervention/retry
   */
  markClipFailed(id: string, error: string): void {
    const clip = this.findById(id);
    if (clip) {
      clip.status = 'failed';
      clip.error = error;
      this.logger.log(`Clip marked as failed: ${id} → ${error}`);
    }
  }

  /**
   * Update clip with Cloudinary URL and thumbnail
   */
  updateClipUrls(
    id: string,
    clipUrl: string,
    thumbnail?: string,
  ): void {
    const clip = this.findById(id);
    if (clip) {
      clip.clipUrl = clipUrl;
      clip.thumbnail = thumbnail;
      clip.status = 'success';
      this.logger.log(`Clip URLs updated: ${id}`);
    }
  }
}
