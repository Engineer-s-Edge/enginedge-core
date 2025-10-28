import { OpenAIWhisperAudio } from '@langchain/community/document_loaders/fs/openai_whisper_audio';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * OpenAIWhisperAudioLoader - A service for loading and transcribing audio files using OpenAI's Whisper
 *
 * This class uses LangChain's OpenAIWhisperAudio to transcribe audio files into text
 * and convert them into Document objects that can be used with LLM pipelines.
 */
@Injectable()
export class OpenAIWhisperAudioLoader {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'OpenAIWhisperAudioLoader initializing',
      OpenAIWhisperAudioLoader.name,
    );
  }
  /**
   * Load an audio file directly from a Blob object and transcribe using OpenAI Whisper
   *
   * @param blob - Blob containing audio data
   * @param options - Optional configuration for audio transcription
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing transcribed text
   */
  async loadBlob(
    blob: Blob,
    options: {
      apiKey?: string;
      model?: string;
      language?: string;
      prompt?: string;
      temperature?: number;
    } = {},
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading audio blob for Whisper transcription (${blob.size} bytes, type: ${blob.type})`,
      OpenAIWhisperAudioLoader.name,
    );
    try {
      // Convert blob to ArrayBuffer and then to Buffer
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Create a temporary file for the audio
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const { v4: uuidv4 } = require('uuid');

      const tempDir = path.join(os.tmpdir(), `audio-transcription-${uuidv4()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Determine file extension from mime type if available
      let fileExtension = '.mp3'; // Default
      if (blob.type) {
        const mimeToExt: Record<string, string> = {
          'audio/mp3': '.mp3',
          'audio/mpeg': '.mp3',
          'audio/wav': '.wav',
          'audio/wave': '.wav',
          'audio/x-wav': '.wav',
          'audio/x-pn-wav': '.wav',
          'audio/flac': '.flac',
          'audio/x-flac': '.flac',
          'audio/ogg': '.ogg',
          'audio/m4a': '.m4a',
          'audio/mp4': '.m4a',
          'audio/x-m4a': '.m4a',
        };
        fileExtension = mimeToExt[blob.type] || fileExtension;
      }

      const tempFilePath = path.join(tempDir, `audio${fileExtension}`);
      fs.writeFileSync(tempFilePath, buffer);

      this.logger.info(
        `Created temporary audio file: ${tempFilePath}`,
        OpenAIWhisperAudioLoader.name,
      );

      // Configure OpenAI Whisper loader
      const loaderOptions: any = {
        filepath: tempFilePath,
        // Pass through any provided OpenAI options
        apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      };

      if (options.model) loaderOptions.model = options.model;
      if (options.language) loaderOptions.language = options.language;
      if (options.prompt) loaderOptions.prompt = options.prompt;
      if (options.temperature !== undefined)
        loaderOptions.temperature = options.temperature;

      this.logger.info(
        `Starting Whisper transcription with model: ${loaderOptions.model || 'default'}`,
        OpenAIWhisperAudioLoader.name,
      );

      // Transcribe the audio
      const loader = new OpenAIWhisperAudio(loaderOptions);
      const docs = await loader.load();

      // Cleanup temporary files
      fs.rm(tempDir, { recursive: true, force: true }, (err: Error) => {
        if (err) {
          this.logger.error(
            `Error removing temporary audio file: ${err.message}`,
            OpenAIWhisperAudioLoader.name,
          );
        } else {
          this.logger.info(
            'Successfully cleaned up temporary audio files',
            OpenAIWhisperAudioLoader.name,
          );
        }
      });

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      this.logger.info(
        `Successfully transcribed audio with Whisper, generated ${docs.length} documents`,
        OpenAIWhisperAudioLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error transcribing audio with OpenAI Whisper\n' + (info.stack || ''),
        OpenAIWhisperAudioLoader.name,
      );
      throw new Error(
        `Error transcribing audio with OpenAI Whisper: ${info.message}`,
      );
    }
  }
}
