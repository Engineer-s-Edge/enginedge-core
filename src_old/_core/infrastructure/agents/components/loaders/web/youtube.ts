import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * YouTubeLoader - A service for loading and transcribing YouTube videos
 *
 * This class uses LangChain's YoutubeLoader to extract transcripts from YouTube videos
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class YouTubeWebLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('YouTubeWebLoader initializing', YouTubeWebLoader.name);
  }
  /**
   * Load transcript from a YouTube video
   *
   * @param videoUrl - YouTube video URL or ID
   * @param options - Optional configuration for YouTube transcript loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing video transcript
   */
  async load(
    videoUrl: string,
    options: {
      language?: string;
      addVideoInfo?: boolean;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading YouTube transcript for video: ${videoUrl} (language: ${options.language || 'en'})`,
      YouTubeWebLoader.name,
    );
    try {
      // Create a YoutubeLoader instance
      const loader = new YoutubeLoader({
        videoId: videoUrl,
        language: options.language || 'en',
        addVideoInfo:
          options.addVideoInfo !== undefined ? options.addVideoInfo : true,
      });

      // Load the video transcript
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully loaded YouTube transcript for ${videoUrl}, generated ${docs.length} documents`,
        YouTubeWebLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading YouTube transcript\n' + (info.stack || ''),
        YouTubeWebLoader.name,
      );
      throw new Error(`Error loading YouTube transcript: ${info.message}`);
    }
  }
}
