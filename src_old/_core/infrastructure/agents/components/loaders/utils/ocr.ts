import * as tesseract from 'node-tesseract-ocr';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * OCR utility for extracting text from images
 */
@Injectable()
export class OcrService {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('OcrService initializing', OcrService.name);
  }
  /**
   * Default configuration for Tesseract OCR
   */
  private defaultConfig = {
    lang: 'eng',
    oem: 1,
    psm: 3,
  };

  /**
   * Recognize text in an image using Tesseract OCR
   *
   * @param imageBuffer - Image data as Buffer
   * @param config - Optional Tesseract configuration
   * @returns Promise<string> - Extracted text
   */
  async recognizeText(
    imageBuffer: Buffer,
    config: {
      lang?: string;
      oem?: number;
      psm?: number;
    } = {},
  ): Promise<string> {
    this.logger.info(
      `Starting OCR recognition (${imageBuffer.length} bytes, lang: ${config.lang || 'eng'})`,
      OcrService.name,
    );
    try {
      // Merge default config with provided config
      const ocrConfig = {
        ...this.defaultConfig,
        ...config,
      };

      // Perform OCR directly on the buffer
      const text = await tesseract.recognize(imageBuffer, ocrConfig);
      const trimmedText = text.trim();

      this.logger.info(
        `OCR recognition completed, extracted ${trimmedText.length} characters`,
        OcrService.name,
      );
      return trimmedText;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'OCR processing failed\n' + (info.stack || ''),
        OcrService.name,
      );
      return ''; // Return empty string on error
    }
  }

  /**
   * Process multiple images with OCR and return their text content
   *
   * @param imageBuffers - Array of image buffers
   * @param config - Optional Tesseract configuration
   * @returns Promise<string[]> - Array of extracted text strings
   */
  async batchRecognize(
    imageBuffers: Buffer[],
    config: {
      lang?: string;
      oem?: number;
      psm?: number;
      minLength?: number;
    } = {},
  ): Promise<string[]> {
    const { minLength = 5, ...ocrConfig } = config;

    this.logger.info(
      `Starting batch OCR recognition for ${imageBuffers.length} images (minLength: ${minLength})`,
      OcrService.name,
    );

    const results = await Promise.all(
      imageBuffers.map((buffer, index) => {
        this.logger.info(
          `Processing image ${index + 1}/${imageBuffers.length}`,
          OcrService.name,
        );
        return this.recognizeText(buffer, ocrConfig);
      }),
    );

    // Filter out empty or too short results if minLength is provided
    const filteredResults = results.filter((text) => text.length >= minLength);

    this.logger.info(
      `Batch OCR completed: ${filteredResults.length}/${results.length} results passed minLength filter`,
      OcrService.name,
    );
    return filteredResults;
  }
}
