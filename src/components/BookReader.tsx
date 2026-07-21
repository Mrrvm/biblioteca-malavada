'use client';

import { useState, useEffect } from 'react';
import { BookMetadata } from '@/app/types/book';

interface BookReaderProps {
  book: BookMetadata;
  downloadUrl: string;
  onClose: () => void;
}

export function BookReader({ book, downloadUrl, onClose }: BookReaderProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBook();
  }, [downloadUrl, book.fileType]);

  const loadBook = async () => {
    setIsLoading(true);
    setError(null);

    try {
      switch (book.fileType) {
        case 'pdf':
          await loadPdf();
          break;
        case 'epub':
          await loadEpub();
          break;
        case 'acsm':
          await loadAcsm();
          break;
        default:
          setError('Unsupported file format');
      }
    } catch (err) {
      console.error('Error loading book:', err);
      setError('Failed to load book');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPdf = async () => {
    // For PDF, we can use an iframe or object tag
    // In a real implementation, you might use a PDF.js based viewer
    console.log('Loading PDF:', downloadUrl);
    setTotalPages(100); // Placeholder - would need actual PDF parsing
  };

  const loadEpub = async () => {
    try {
      // Use epubjs to load and render EPUB
      const { default: ePub } = await import('epubjs');

      // Create EPUB reader
      const book = ePub(downloadUrl);

      // Wait for book to be ready
      await book.ready;

      // Generate locations for page-like navigation
      const locations = await book.locations.generate(600); // Generate locations every 600 characters
      setTotalPages(locations.length);

      // Render first page
      const rendition = book.renderTo('epub-viewer', {
        width: '100%',
        height: '100%',
        spread: 'none'
      });

      rendition.display(book.locations.cfiFromPercentage(0)); // Display the first location

      interface RenditionLocation {
        start: { cfi: string, displayed: { page: number, total: number } };
        end: { cfi: string, displayed: { page: number, total: number } };
      }

      // Handle page changes
      rendition.on('relocated', (location: RenditionLocation) => {
        setCurrentPage(location.start.displayed.page);
      });

    } catch (err) {
      console.error('Error loading EPUB:', err);
      throw new Error('Failed to load EPUB');
    }
  };

  const loadAcsm = async () => {
    // ACSM files are Adobe DRM files that need to be activated
    // This would typically open in Adobe Digital Editions or similar
    console.log('ACSMs require external activation:', downloadUrl);
    setError('ACSMs require Adobe Digital Editions for activation and reading');
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-md">
          <h2 className="text-xl font-bold mb-4">Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white p-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">{book.title}</h2>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={onClose}
            className="bg-gray-300 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>

      {/* Reader Content */}
      <div className="flex-1 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-lg">Loading book...</div>
          </div>
        ) : (
          <>
            {/* Navigation Buttons */}
            <button
              onClick={prevPage}
              disabled={currentPage <= 1}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white p-2 rounded-full shadow-md disabled:opacity-50"
            >
              ←
            </button>

            <button
              onClick={nextPage}
              disabled={currentPage >= totalPages}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white p-2 rounded-full shadow-md disabled:opacity-50"
            >
              →
            </button>

            {/* Book Content */}
            <div className="h-full w-full flex items-center justify-center">
              {book.fileType === 'pdf' && (
                <iframe
                  src={downloadUrl}
                  className="w-full h-full"
                  title={`PDF Reader - ${book.title}`}
                />
              )}

              {book.fileType === 'epub' && (
                <div id="epub-viewer" className="w-full h-full" />
              )}

              {book.fileType === 'acsm' && (
                <div className="text-white text-center">
                  <p className="text-lg mb-4">ACSMs require Adobe Digital Editions</p>
                  <a
                    href={downloadUrl}
                    download
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                  >
                    Download ACSM File
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer Controls */}
      <div className="bg-white p-4 flex justify-between items-center">
        <div className="flex space-x-2">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="bg-gray-300 text-gray-700 px-3 py-1 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={nextPage}
            disabled={currentPage >= totalPages}
            className="bg-gray-300 text-gray-700 px-3 py-1 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="range"
            min="1"
            max={totalPages}
            value={currentPage}
            onChange={(e) => setCurrentPage(Number(e.target.value))}
            className="w-32"
          />
          <span className="text-sm text-gray-600">
            {currentPage} / {totalPages}
          </span>
        </div>

        <div className="flex space-x-2">
          <button className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700">
            Zoom +
          </button>
          <button className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700">
            Zoom -
          </button>
        </div>
      </div>
    </div>
  );
}