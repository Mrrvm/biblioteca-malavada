export interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface BookNote {
  id: string;
  userId: string;
  bookId: string;
  text?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserBookState {
  userId: string;
  bookId: string;
  isRead: boolean;
  isInReadingList: boolean;
  readAt?: string;
  addedToListAt?: string;
}

export interface LibraryCollection {
  id: string;
  name: string;
  description?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcquiredBookNote {
  id: string;
  userId: string;
  title: string;
  author?: string;
  isbn?: string;
  notes?: string;
  priority?: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
}

export interface BookMetadata {
  id: string;
  title: string;
  author: string;
  authors?: string[];
  date?: string;
  publicationDate?: string;
  genres?: string[];
  isbn?: string;
  description?: string;
  publisher?: string;
  language?: string;
  pages?: number;
  coverImage?: string;        // legacy – kept for backward compatibility
  coverFileId?: string;       // new: Drive file ID for the cover image
  filePath?: string;
  fileType: 'epub' | 'pdf' | 'acsm' | 'physical';
  collections: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadBookRequest {
  metadata: Omit<BookMetadata, 'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'coverFileId'>;
  file?: File;
}

export interface LibraryData {
  books: BookMetadata[];
  notes: BookNote[];
  userBookStates: UserBookState[];
  collections: LibraryCollection[];
  booksToAcquire: AcquiredBookNote[];
}