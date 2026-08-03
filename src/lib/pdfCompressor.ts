import { PDFDocument } from 'pdf-lib';

// 10MB in bytes
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface CompressionResult {
  compressed: boolean;
  buffer: Uint8Array;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export async function compressPDFIfNeeded(
  fileBuffer: ArrayBuffer,
  fileName: string
): Promise<CompressionResult> {
  const originalSize = fileBuffer.byteLength;

  // Check if file is PDF and larger than 10MB
  if (!fileName.toLowerCase().endsWith('.pdf') || originalSize <= MAX_FILE_SIZE) {
    return {
      compressed: false,
      buffer: new Uint8Array(fileBuffer),
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1
    };
  }

})`);

  try {
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(fileBuffer);
    
    // Get all pages
    const pages = pdfDoc.getPages();
    
    // Optional: You can add more compression techniques here
    // For example, you could reduce image quality or remove metadata
    
    // Save the compressed PDF
    const compressedPdfBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 100,
    });

    const compressedSize = compressedPdfBytes.length;
    const compressionRatio = compressedSize / originalSize;

} → ${formatFileSize(compressedSize)} (${(compressionRatio * 100).toFixed(1)}%)`);

return {
  compressed: true,
  buffer: compressedPdfBytes,
  originalSize,
  compressedSize,
  compressionRatio
};
  } catch (error) {
  console.error('PDF compression failed:', error);
  // If compression fails, return the original file
  return {
    compressed: false,
    buffer: new Uint8Array(fileBuffer),
    originalSize,
    compressedSize: originalSize,
    compressionRatio: 1
  };
}
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function shouldCompressPDF(fileBuffer: ArrayBuffer, fileName: string): Promise<boolean> {
  return (
    fileName.toLowerCase().endsWith('.pdf') &&
    fileBuffer.byteLength > MAX_FILE_SIZE
  );
}