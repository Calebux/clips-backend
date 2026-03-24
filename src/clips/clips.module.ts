import { Module } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { ClipGenerationProcessor } from './clip-generation.processor';
import { CloudinaryService } from './cloudinary.service';

@Module({
  controllers: [ClipsController],
  providers: [ClipsService, ClipGenerationProcessor, CloudinaryService],
  exports: [ClipsService, CloudinaryService],
})
export class ClipsModule {}
