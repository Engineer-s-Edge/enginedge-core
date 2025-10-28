// Mock pdfjs-dist to avoid ES module issues
export const getDocument = jest.fn();
export const PDFWorker = jest.fn();

export default {
  getDocument,
  PDFWorker,
};
