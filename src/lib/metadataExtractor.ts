import { BookMetadata } from '@/app/types/book';

export function extractMetadataFromFilename(filename: string): Partial<BookMetadata> {
  const metadata: Partial<BookMetadata> = {};

  const patterns = [
    // Pattern: Author - Title (Year).ext
    /^(.*?)\s*-\s*(.*?)\s*\((\d{4})\)\.[^.]+$/i,
    // Pattern: Title - Author (Year).ext
    /^(.*?)\s*-\s*(.*?)\s*\((\d{4})\)\.[^.]+$/i,
    // Pattern: Author - Title.ext
    /^(.*?)\s*-\s*(.*?)\.[^.]+$/i,
    // Pattern: Title by Author.ext
    /^(.*?)\s+by\s+(.*?)\.[^.]+$/i,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      if (pattern.source.includes('by')) {
        // Title by Author pattern
        metadata.title = match[1]?.trim();
        metadata.author = match[2]?.trim();
      } else if (match[3]) {
        // Includes year
        metadata.author = match[1]?.trim();
        metadata.title = match[2]?.trim();
        metadata.publicationDate = match[3];
      } else {
        // Basic author - title
        metadata.author = match[1]?.trim();
        metadata.title = match[2]?.trim();
      }
      break;
    }
  }

  const isbnMatch = filename.match(/\b(97[89][\d]{10}|\d{9}[\dXx])\b/);
  if (isbnMatch) {
    metadata.isbn = isbnMatch[0];
  }

  return metadata;
}

export async function searchBookMetadataOnline(
  query: string,
  isbn?: string
): Promise<Partial<BookMetadata> | null> {
  try {
    let searchQuery = query;
    if (isbn) {
      searchQuery = `isbn:${isbn}`;
    }

    const encodedQuery = encodeURIComponent(searchQuery);
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodedQuery}&maxResults=1`
    );

    if (!response.ok) {
      throw new Error('Google Books API request failed');
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const bookInfo = data.items[0].volumeInfo;

      const metadata: Partial<BookMetadata> = {
        title: bookInfo.title,
        author: bookInfo.authors?.join(', '),
        authors: bookInfo.authors,
        publisher: bookInfo.publisher,
        publicationDate: bookInfo.publishedDate,
        description: bookInfo.description,
        isbn: bookInfo.industryIdentifiers?.find((id: any) => id.type === 'ISBN_13')?.identifier ||
          bookInfo.industryIdentifiers?.find((id: any) => id.type === 'ISBN_10')?.identifier,
        isbn13: bookInfo.industryIdentifiers?.find((id: any) => id.type === 'ISBN_13')?.identifier,
        isbn10: bookInfo.industryIdentifiers?.find((id: any) => id.type === 'ISBN_10')?.identifier,
        pages: bookInfo.pageCount,
        language: bookInfo.language,
        genres: bookInfo.categories,
        genre: bookInfo.categories?.join(', '),
      };

      return metadata;
    }

    if (isbn) {
      const olResponse = await fetch(
        `https://openlibrary.org/isbn/${isbn}.json`
      );

      if (olResponse.ok) {
        const olData = await olResponse.json();
        const metadata: Partial<BookMetadata> = {
          title: olData.title,
          author: olData.authors?.map((a: any) => a.name).join(', '),
          authors: olData.authors?.map((a: any) => a.name),
          publicationDate: olData.publish_date,
          publisher: olData.publishers?.join(', '),
          pages: olData.number_of_pages,
        };
        return metadata;
      }
    }

    return null;
  } catch (error) {
    console.error('Error searching for book metadata online:', error);
    return null;
  }
}

export async function extractMetadataFromEpub(file: File): Promise<Partial<BookMetadata>> {
  try {
    const metadata: Partial<BookMetadata> = {};

    const filenameMetadata = extractMetadataFromFilename(file.name);
    Object.assign(metadata, filenameMetadata);

    if (metadata.isbn || metadata.title) {
      const onlineMetadata = await searchBookMetadataOnline(
        metadata.title || file.name,
        metadata.isbn
      );

      if (onlineMetadata) {
        Object.assign(metadata, onlineMetadata);
      }
    }

    return metadata;
  } catch (error) {
    console.error('Error extracting metadata from EPUB:', error);
    return extractMetadataFromFilename(file.name);
  }
}

export async function extractMetadataFromPdf(file: File): Promise<Partial<BookMetadata>> {
  try {
    const metadata: Partial<BookMetadata> = extractMetadataFromFilename(file.name);

    if (metadata.isbn || metadata.title) {
      const onlineMetadata = await searchBookMetadataOnline(
        metadata.title || file.name,
        metadata.isbn
      );

      if (onlineMetadata) {
        Object.assign(metadata, onlineMetadata);
      }
    }

    return metadata;
  } catch (error) {
    console.error('Error extracting metadata from PDF:', error);
    return extractMetadataFromFilename(file.name);
  }
}

export async function extractBookMetadata(file: File | null, filename: string): Promise<Partial<BookMetadata>> {
  let metadata: Partial<BookMetadata> = {};

  // First, extract from filename
  const filenameMetadata = extractMetadataFromFilename(filename);
  Object.assign(metadata, filenameMetadata);

  if (file) {
    try {
      if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) {
        const epubMetadata = await extractMetadataFromEpub(file);
        Object.assign(metadata, epubMetadata);
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const pdfMetadata = await extractMetadataFromPdf(file);
        Object.assign(metadata, pdfMetadata);
      }
    } catch (error) {
      console.error('Error extracting metadata from file:', error);
    }
  }

  try {
    const onlineMetadata = await searchBookMetadataOnline(
      metadata.title || filename,
      metadata.isbn
    );

    if (onlineMetadata) {
      Object.assign(metadata, onlineMetadata);
    }
  } catch (error) {
    console.error('Error with online metadata search:', error);
  }

  return metadata;
}