import { Injectable, Logger } from '@nestjs/common';
import { Clip } from './clip.entity';
import { calculateViralityScore } from './virality-score.util';
import { cutClip } from './ffmpeg.util';
import { CloudinaryService } from './cloudinary.service';

export interface ClipGenerationJob {
  videoId: string;
  /** Absolute path to the source video file */
  inputPath: string;
  /** Absolute path for the output clip file */
  outputPath: string;
  /** Start time in seconds — float safe (e.g. 12.5) */
  startTime: number;
  /** End time in seconds — float safe (e.g. 45.7) */
  endTime: number;
  /** Total duration of the source video in seconds (used to clamp endTime) */
  videoDuration?: number;
  /** 0.0–1.0: where in the source video this clip starts */
  positionRatio: number;
  transcript?: string;
}

export interface ClipProcessingResult {
  clip: Clip;
  retryCount?: number;
  error?: string;
}

/**
 * Clip-generation processor.
 *
 * Currently runs synchronously as a plain NestJS provider.
 * When a queue is introduced, convert this to a BullMQ @Processor class
 * and decorate `process()` with @Process() — the scoring logic stays unchanged.
 *
 * After FFmpeg cuts a clip:
 * 1. Uploads to Cloudinary for CDN delivery
 * 2. Generates and saves thumbnail URL
 * 3. Deletes local temporary file
 * 4. Handles errors with retry support
 */
@Injectable()
export class ClipGenerationProcessor {
  private readonly logger = new Logger(ClipGenerationProcessor.name);
  private readonly maxRetries = 3;

  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async process(job: ClipGenerationJob): Promise<Clip> {
    const durationSeconds = job.endTime - job.startTime;
    const clipId = `${job.videoId}-${job.startTime}-${job.endTime}`;

    try {
      // Cut the video file — float startTime/endTime are handled safely inside cutClip
      this.logger.log(`Starting clip generation: ${clipId}`);
      await cutClip({
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        startTime: job.startTime,
        endTime: job.endTime,
        videoDuration: job.videoDuration,
      });

      const viralityScore = calculateViralityScore({
        durationSeconds,
        positionRatio: job.positionRatio,
        transcript: job.transcript,
      });

      this.logger.log(
        `Clip cut successfully — videoId=${job.videoId} ` +
          `duration=${durationSeconds}s ` +
          `position=${(job.positionRatio * 100).toFixed(0)}% ` +
          `viralityScore=${viralityScore}`,
      );

      // Upload to Cloudinary with retry logic
      const uploadResult = await this.uploadWithRetry(
        job.outputPath,
        clipId,
        0,
      );

      if (uploadResult.error) {
        this.logger.error(
          `Failed to upload clip after ${this.maxRetries} retries: ${uploadResult.error}`,
        );

        return {
          id: clipId,
          videoId: job.videoId,
          startTime: job.startTime,
          endTime: job.endTime,
          positionRatio: job.positionRatio,
          transcript: job.transcript,
          viralityScore,
          status: 'failed',
          error: uploadResult.error,
          createdAt: new Date(),
        };
      }

      // Delete local temporary file after successful upload
      await this.cloudinaryService.deleteLocalFile(job.outputPath);

      this.logger.log(
        `Clip processing complete: ${clipId} → ${uploadResult.secure_url}`,
      );

      return {
        id: clipId,
        videoId: job.videoId,
        startTime: job.startTime,
        endTime: job.endTime,
        positionRatio: job.positionRatio,
        transcript: job.transcript,
        viralityScore,
        clipUrl: uploadResult.secure_url,
        thumbnail: uploadResult.thumbnail_url,
        status: 'success',
        createdAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Clip generation failed for ${clipId}: ${error.message}`,
        error.stack,
      );

      // Attempt cleanup of local file
      try {
        await this.cloudinaryService.deleteLocalFile(job.outputPath);
      } catch (cleanupError) {
        this.logger.warn(
          `Cleanup failed for ${job.outputPath}: ${cleanupError.message}`,
        );
      }

      return {
        id: clipId,
        videoId: job.videoId,
        startTime: job.startTime,
        endTime: job.endTime,
        positionRatio: job.positionRatio,
        transcript: job.transcript,
        viralityScore: null,
        status: 'failed',
        error: error.message,
        createdAt: new Date(),
      };
    }
  }

  /**
   * Upload clip to Cloudinary with exponential backoff retry
   * @param filePath - Path to clip file
   * @param clipId - Unique clip identifier
   * @param retryCount - Current retry attempt
   */
  private async uploadWithRetry(
    filePath: string,
    clipId: string,
    retryCount: number = 0,
  ): Promise<any> {
    try {
      const buffer = await this.cloudinaryService.readFileToBuffer(filePath);
      const result = await this.cloudinaryService.uploadVideoFromBuffer(
        buffer,
        clipId,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      if (retryCount < this.maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        this.logger.warn(
          `Upload failed for ${clipId}, retry ${retryCount + 1}/${this.maxRetries} in ${delay}ms`,
        );
        await this.sleep(delay);
        return this.uploadWithRetry(filePath, clipId, retryCount + 1);
      }

      this.logger.error(
        `All upload retries exhausted for ${clipId}: ${error.message}`,
      );
      return {
        secure_url: '',
        public_id: clipId,
        error: error.message,
      };
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
