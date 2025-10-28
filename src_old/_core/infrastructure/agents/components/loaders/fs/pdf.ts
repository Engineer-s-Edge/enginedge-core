import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';
import { Injectable } from '@nestjs/common';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getErrorInfo } from '@common/error-assertions';
import { ImageUtils } from './image';
import { OcrService } from '../utils/ocr';
import { MyLogger } from '@core/services/logger/logger.service';

/**
 * PDFDocumentLoader - A service for loading and parsing PDF files
 *
 * This class uses LangChain's PDFLoader to extract text from PDF files and
 * convert them into Document objects that can be used with LLM pipelines.
 * It also supports OCR for extracting text from images in PDFs.
 */
@Injectable()
export class PDFDocumentLoader {
  constructor(
    private readonly imageUtils: ImageUtils,
    private readonly ocrService: OcrService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('PDFDocumentLoader initializing', PDFDocumentLoader.name);
  }
  /**
   * Load a PDF directly from a Blob object
   *
   * @param blob - Blob containing PDF data
   * @param options - Optional configuration for PDF loading
   * @param metadata - Optional metadata to include with the documents
   * @returns Promise<Document[]> - Array of Document objects containing text chunks
   */
  async loadBlob(
    blob: Blob,
    options: {
      splitPages?: boolean;
      ocrEnabled?: boolean;
      ocrLanguage?: string;
    } = { splitPages: true, ocrEnabled: false, ocrLanguage: 'eng' },
    metadata: Record<string, any> = {},
  ): Promise<Document[]> {
    this.logger.info(
      `Loading PDF blob (${blob.size} bytes, splitPages: ${options.splitPages}, OCR: ${options.ocrEnabled})`,
      PDFDocumentLoader.name,
    );
    try {
      // Create a PDFLoader instance directly with the blob
      const loader = new PDFLoader(blob, {
        splitPages: options.splitPages,
        parsedItemSeparator: '\n',
      });

      // Load and parse the PDF
      const docs = await loader.load();

      // Add any provided metadata
      if (Object.keys(metadata).length > 0) {
        docs.forEach((doc) => {
          doc.metadata = { ...doc.metadata, ...metadata };
        });
      }

      // Apply OCR if enabled
      if (options.ocrEnabled) {
        this.logger.info(
          `Starting OCR processing for PDF with language: ${options.ocrLanguage}`,
          PDFDocumentLoader.name,
        );
        const ocrConfig = { lang: options.ocrLanguage || 'eng' };
        const enhancedDocs = await this.processWithOCR(blob, docs, ocrConfig);
        this.logger.info(
          `OCR processing completed, enhanced ${enhancedDocs.length} documents`,
          PDFDocumentLoader.name,
        );
        return enhancedDocs;
      }

      this.logger.info(
        `Successfully loaded PDF, generated ${docs.length} documents`,
        PDFDocumentLoader.name,
      );
      return docs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error loading PDF from blob\n' + (info.stack || ''),
        PDFDocumentLoader.name,
      );
      throw new Error(`Error loading PDF from blob: ${info.message}`);
    }
  }

  /**
   * Process PDF with OCR to extract text from images
   *
   * @param blob - PDF blob data
   * @param docs - Existing document objects from initial parsing
   * @param ocrConfig - OCR configuration
   * @returns Promise<Document[]> - Enhanced documents with OCR text
   */
  private async processWithOCR(
    blob: Blob,
    docs: Document[],
    ocrConfig: { lang: string },
  ): Promise<Document[]> {
    try {
      this.logger.info(
        'Starting OCR processing for PDF',
        PDFDocumentLoader.name,
      );

      // Convert blob to ArrayBuffer
      const pdfBuffer = await blob.arrayBuffer();
      const data = new Uint8Array(pdfBuffer);

      // Load PDF document using PDF.js
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdfDocument = await loadingTask.promise;

      const numPages = pdfDocument.numPages;
      const ocrResults: {
        pageNum: number;
        text: string;
        imageCount: number;
      }[] = [];

      this.logger.info(
        `Processing ${numPages} pages for OCR`,
        PDFDocumentLoader.name,
      );

      // Process each page
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        this.logger.info(
          `Extracting images from page ${pageNum}`,
          PDFDocumentLoader.name,
        );
        const page = await pdfDocument.getPage(pageNum);

        // Extract images from the page
        const images = await this.extractImagesFromPage(page);

        if (images.length === 0) {
          this.logger.info(
            `No images found on page ${pageNum} for OCR processing`,
            PDFDocumentLoader.name,
          );
          ocrResults.push({
            pageNum,
            text: '',
            imageCount: 0,
          });
          continue;
        }

        this.logger.info(
          `Found ${images.length} images on page ${pageNum}, processing with OCR`,
          PDFDocumentLoader.name,
        );
        // Process all images with OCR
        const imageBuffers = images.map((img) => img.buffer);
        const ocrTexts = await this.ocrService.batchRecognize(imageBuffers, {
          lang: ocrConfig.lang,
          minLength: 5,
        });

        // Combine OCR results
        const ocrText = ocrTexts.join('\n\n');

        ocrResults.push({
          pageNum,
          text: ocrText,
          imageCount: images.length,
        });

        this.logger.info(
          `OCR completed for page ${pageNum}, extracted ${ocrTexts.length} text segments`,
          PDFDocumentLoader.name,
        );
      }

      // Enhance documents with OCR text
      const enhancedDocs = docs.map((doc) => {
        // Find OCR results for this page
        const pageNum = doc.metadata?.page || 1;
        const ocrResult = ocrResults.find((r) => r.pageNum === pageNum);

        if (ocrResult && ocrResult.text) {
          // Add OCR text to the document
          const originalText = doc.pageContent;
          const enhancedText =
            originalText +
            '\n\n===== OCR TEXT FROM IMAGES =====\n\n' +
            ocrResult.text;

          // Update document with enhanced text
          return new Document({
            pageContent: enhancedText,
            metadata: {
              ...doc.metadata,
              containsOcrText: true,
              imageCount: ocrResult.imageCount,
              ocrProcessedAt: new Date().toISOString(),
            },
          });
        }

        return doc;
      });

      this.logger.info(
        'OCR processing completed successfully',
        PDFDocumentLoader.name,
      );
      return enhancedDocs;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'OCR processing failed\n' + (info.stack || ''),
        PDFDocumentLoader.name,
      );
      // Return original documents if OCR fails
      return docs;
    }
  }

  /**
   * Extract images from a PDF page
   *
   * @param page - PDF.js Page object
   * @returns Promise<{width: number, height: number, buffer: Buffer}[]> - Array of image data
   */
  private async extractImagesFromPage(
    page: any,
  ): Promise<{ width: number; height: number; buffer: Buffer }[]> {
    const images: { width: number; height: number; buffer: Buffer }[] = [];

    try {
      // Get the operator list from the page
      const operatorList = await page.getOperatorList();
      const imageKeys = new Set<string>();

      // Find image objects in the page
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];
        // Check if this operation involves an image
        if (op === pdfjsLib.OPS.paintImageXObject) {
          const imageKey = args[0];
          if (imageKey && !imageKeys.has(imageKey)) {
            imageKeys.add(imageKey);
          }
        }
      }

      // Extract each unique image
      for (const imageKey of imageKeys) {
        try {
          const imageObj = await page.objs.get(imageKey);

          // Skip small or low-resolution images that are unlikely to contain text
          if (imageObj.width < 50 || imageObj.height < 50) {
            continue;
          }
          // Convert image data to Buffer using ImageUtils
          const imageBuffer =
            await this.imageUtils.extractImageBuffer(imageObj);

          // Check if this image is likely to contain text
          const isTextImage = this.imageUtils.isLikelyTextImage(
            imageObj.data,
            imageObj.width,
            imageObj.height,
          );

          // Only keep images that are likely to contain text
          if (isTextImage) {
            images.push({
              width: imageObj.width,
              height: imageObj.height,
              buffer: imageBuffer,
            });
          }
        } catch (error) {
          const info = getErrorInfo(error);
          this.logger.warn(
            `Error extracting image: ${info.message}`,
            PDFDocumentLoader.name,
          );
          continue;
        }
      }

      return images;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error extracting images from page\n' + (info.stack || ''),
        PDFDocumentLoader.name,
      );
      return [];
    }
  }
}
