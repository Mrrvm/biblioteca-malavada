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
    const googleBooksApiKey = process.env.GOOGLE_BOOKS_API_KEY;

    const buildGoogleBooksQuery = () => {
      if (isbn) return `isbn:${isbn}`;
      return query;
    };

    const runGoogleBooks = async (withKey: boolean): Promise<Partial<BookMetadata> | null> => {
      try {
        const q = encodeURIComponent(buildGoogleBooksQuery());
        const key = withKey && googleBooksApiKey ? `&key=${googleBooksApiKey}` : '';
        const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1${key}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          const item = data.items[0];
          const bookInfo = item.volumeInfo;
          const metadata: Partial<BookMetadata> = {
            title: bookInfo.title,
            author: bookInfo.authors?.join(', '),
            authors: bookInfo.authors,
            publisher: bookInfo.publisher,
            publicationDate: bookInfo.publishedDate,
            description: bookInfo.description,
            isbn: bookInfo.industryIdentifiers?.find((id: any) => id.type === 'ISBN_13')?.identifier ||
              bookInfo.industryIdentifiers?.find((id: any) => id.type === 'ISBN_10')?.identifier,
            pages: bookInfo.pageCount,
            language: bookInfo.language,
            genres: bookInfo.categories,
            coverImage: bookInfo.imageLinks?.thumbnail?.replace('http:', 'https:').replace('&edge=curl', '').replace('zoom=1', 'zoom=2'),
          };
          return metadata;
        }
      } catch (err) {
        console.warn('Google Books search failed:', err);
      }
      return null;
    };

    if (googleBooksApiKey) {
      const gb = await runGoogleBooks(true);
      if (gb) return gb;
    }

    const gbNoKey = await runGoogleBooks(false);
    if (gbNoKey) return gbNoKey;

    if (isbn) {
      try {
        const ltResponse = await fetch(
          `https://www.librarything.com/api/thingISBN/${isbn}.json`
        );
        if (ltResponse.ok) {
          try {
            const data = await ltResponse.json();
            const similarIsbns = Object.values(data || {}).flat().filter((x: any) => typeof x === 'string' && x !== isbn) as string[];
            if (similarIsbns && similarIsbns.length > 0 && !isbn) {
              // Use similar ISBN as fallback isbn hint
            }
          } catch (e) { /* LibraryThing response can be malformed */ }
        }
      } catch (ltError) {
        console.warn('LibraryThing ISBN lookup failed:', ltError);
      }
    }

    if (isbn) {
      try {
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
            isbn,
          };
          if (olData.works && olData.works[0]?.key) {
            try {
              const workKey = olData.works[0].key;
              const workResp = await fetch(`https://openlibrary.org${workKey}.json`);
              if (workResp.ok) {
                const workData = await workResp.json();
                metadata.description =
                  typeof workData.description === 'string' ? workData.description :
                    workData.description?.value;
              }
            } catch (workErr) { /* ignore */ }
          }
          return metadata;
        }
      } catch (olError) {
        console.warn('Open Library ISBN lookup failed:', olError);
      }
    }

    try {
      const searchQuery = new URLSearchParams();
      if (isbn) {
        searchQuery.set('isbn', isbn);
      } else {
        searchQuery.set('title', query);
      }
      const olSearchResponse = await fetch(
        `https://openlibrary.org/search.json?${searchQuery.toString()}&limit=1`
      );

      if (olSearchResponse.ok) {
        const olSearchData = await olSearchResponse.json();
        if (olSearchData.docs && olSearchData.docs.length > 0) {
          const doc = olSearchData.docs[0];
          const metadata: Partial<BookMetadata> = {
            title: doc.title,
            author: doc.author_name?.join(', '),
            authors: doc.author_name,
            publicationDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
            publisher: doc.publisher?.join(', '),
            pages: doc.number_of_pages_median,
            isbn: doc.isbn?.find((i: string) => i.length === 13) || doc.isbn?.[0],
            language: doc.language?.[0],
            genres: doc.subject,
            coverImage: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false` : undefined,
          };
          return metadata;
        }
      }
    } catch (olSearchError) {
      console.warn('Open Library search failed:', olSearchError);
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