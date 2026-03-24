import { IsArray, IsBoolean, IsOptional, IsString, ArrayNotEmpty } from 'class-validator';

export class BulkUpdateClipsDto {
  /** IDs of clips to update — must all belong to the requesting user */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  clipIds: string[];

  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  /**
   * Freeform posting status.
   * Simple values: 'pending' | 'posted' | 'failed'
   * Or a platform-specific JSON object, e.g. { platform: 'tiktok', status: 'posted', postId: '...' }
   */
  @IsOptional()
  postStatus?: unknown;
}
