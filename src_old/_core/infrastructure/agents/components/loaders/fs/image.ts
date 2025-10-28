import { createCanvas, loadImage } from 'canvas';
import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

/**
 * Image processing utilities for working with PDF images
 */
@Injectable()
export class ImageUtils {
  constructor(private readonly logger: MyLogger) {
    this.logger.info('ImageUtils initializing', ImageUtils.name);
  } /**
   * Check if an image is likely to contain text based on its characteristics
   *
   * @param imageData - Raw image data
   * @param width - Image width
   * @param height - Image height
   * @returns boolean - True if the image likely contains text
   */
  isLikelyTextImage(
    imageData: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
  ): boolean {
    this.logger.info(
      `Analyzing image for text content (${width}x${height}, ${imageData.length} bytes)`,
      ImageUtils.name,
    );

    // Skip very small images (likely icons, decorations)
    if (width < 50 || height < 50) {
      this.logger.info('Image too small, likely not text', ImageUtils.name);
      return false;
    }

    // Skip very thin images (likely decorative lines)
    const aspectRatio = width / height;
    if (aspectRatio > 10 || aspectRatio < 0.1) {
      this.logger.info(
        `Image aspect ratio too extreme (${aspectRatio.toFixed(2)}), likely not text`,
        ImageUtils.name,
      );
      return false;
    }

    // Calculate image complexity (variance in pixel values)
    // This helps distinguish text images from simple graphics
    const complexity = this.calculateImageComplexity(imageData);
    const isTextImage = complexity > 20; // Threshold determined empirically

    this.logger.info(
      `Image complexity: ${complexity.toFixed(2)}, likely text: ${isTextImage}`,
      ImageUtils.name,
    );
    return isTextImage;
  }

  /**
   * Calculate image complexity as variance in pixel values
   *
   * @param imageData - Raw image data
   * @returns number - Complexity score
   */
  private calculateImageComplexity(
    imageData: Uint8Array | Uint8ClampedArray,
  ): number {
    // Sample the image data to save processing time
    const sampleSize = Math.min(1000, imageData.length / 4);
    const sampleStep = Math.floor(imageData.length / sampleSize);

    // Calculate mean pixel value
    let sum = 0;
    for (let i = 0; i < imageData.length; i += sampleStep) {
      sum += imageData[i];
    }
    const mean = sum / (imageData.length / sampleStep);

    // Calculate variance
    let variance = 0;
    for (let i = 0; i < imageData.length; i += sampleStep) {
      variance += Math.pow(imageData[i] - mean, 2);
    }
    variance /= imageData.length / sampleStep;

    return Math.sqrt(variance); // Return standard deviation as complexity
  }
  /**
   * Convert PDF.js image data to a Buffer
   *
   * @param imageData - PDF.js image data
   * @param format - Image format (default: 'png')
   * @returns Promise<Buffer> - Image as a buffer
   */
  async convertToBuffer(
    imageData: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    format: 'png' | 'jpeg' = 'png',
  ): Promise<Buffer> {
    this.logger.info(
      `Converting image to buffer (${width}x${height}, format: ${format})`,
      ImageUtils.name,
    );

    try {
      // Create a canvas with the image dimensions
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Create an ImageData object from the raw data
      const imgData = ctx.createImageData(width, height);

      // Copy the pixel data
      // If imageData is RGBA, use it directly; otherwise convert grayscale to RGBA
      if (imageData.length === width * height * 4) {
        // RGBA data - copy directly
        for (let i = 0; i < imageData.length; i++) {
          imgData.data[i] = imageData[i];
        }
        this.logger.info('Using RGBA image data directly', ImageUtils.name);
      } else {
        // Grayscale data - convert to RGBA
        for (let i = 0; i < width * height; i++) {
          const val = imageData[i];
          imgData.data[i * 4] = val; // R
          imgData.data[i * 4 + 1] = val; // G
          imgData.data[i * 4 + 2] = val; // B
          imgData.data[i * 4 + 3] = 255; // A (fully opaque)
        }
        this.logger.info('Converted grayscale to RGBA', ImageUtils.name);
      }

      // Put the image data on the canvas
      ctx.putImageData(imgData, 0, 0);

      // Convert to buffer using specific mime type
      const buffer =
        format === 'png'
          ? Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64')
          : Buffer.from(canvas.toDataURL('image/jpeg').split(',')[1], 'base64');

      this.logger.info(
        `Successfully converted image to ${format} buffer (${buffer.length} bytes)`,
        ImageUtils.name,
      );
      return buffer;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error converting image to buffer\n' + (info.stack || ''),
        ImageUtils.name,
      );
      throw new Error(info.message);
    }
  }

  /**
   * Extract images from PDF.js image object
   *
   * @param imgObj - PDF.js image object
   * @returns Promise<Buffer> - Image as buffer
   */
  async extractImageBuffer(imgObj: any): Promise<Buffer> {
    if (!imgObj || !imgObj.data || !imgObj.width || !imgObj.height) {
      this.logger.error(
        'Invalid image object provided to extractImageBuffer',
        ImageUtils.name,
      );
      throw new Error('Invalid image object');
    }

    this.logger.info(
      `Extracting image buffer from PDF.js object (${imgObj.width}x${imgObj.height})`,
      ImageUtils.name,
    );
    return this.convertToBuffer(imgObj.data, imgObj.width, imgObj.height);
  }
}
