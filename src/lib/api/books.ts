import { BookMetadata, UploadBookRequest, LibraryData, BookNote, UserBookState, LibraryCollection, AcquiredBookNote } from '@/app/types/book';

const API_BASE = '/api/books';

export const bookApi = {
  async getLibraryData(): Promise<LibraryData> {
    const response = await fetch(API_BASE);
    if (!response.ok) throw new Error('Failed to fetch library data');
    return response.json();
  },

  async getBook(id: string): Promise<BookMetadata> {
    const response = await fetch(`${API_BASE}/${id}`);
    if (!response.ok) throw new Error('Failed to fetch book');
    return response.json();
  },

  async uploadBook(data: UploadBookRequest, file?: File, customCover?: File): Promise<BookMetadata> {
    const formData = new FormData();
    formData.append('metadata', JSON.stringify(data.metadata));
    if (file) {
      formData.append('file', file);
    }
    if (customCover) {
      formData.append('customCover', customCover);
    }
    const response = await fetch(API_BASE, { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.details || 'Failed to upload book');
    }
    return response.json();
  },

  async deleteBook(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete book');
  },

  async downloadBook(id: string): Promise<string> {
    const response = await fetch(`${API_BASE}/${id}/download`);
    if (!response.ok) throw new Error('Failed to get download URL');
    const data = await response.json();
    return data.downloadUrl;
  },

  async addToCollection(id: string, collection: string): Promise<BookMetadata> {
    const response = await fetch(`${API_BASE}/${id}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection }),
    });
    if (!response.ok) throw new Error('Failed to add to collection');
    return response.json();
  },

  async removeFromCollection(id: string, collection: string): Promise<BookMetadata> {
    const response = await fetch(`${API_BASE}/${id}/collections`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection }),
    });
    if (!response.ok) throw new Error('Failed to remove from collection');
    return response.json();
  },

  async updateBook(id: string, metadata: Partial<BookMetadata>, coverFile?: File): Promise<BookMetadata> {
    const formData = new FormData();
    formData.append('metadata', JSON.stringify(metadata));
    if (coverFile) {
      formData.append('coverFile', coverFile);
    }
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to update book');
    return response.json();
  },

  async createNote(bookId: string, text?: string): Promise<BookNote> {
    const formData = new FormData();
    formData.append('bookId', bookId);
    if (text) formData.append('text', text);
    const response = await fetch('/api/notes', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Failed to create note');
    return response.json();
  },

  async deleteNote(id: string): Promise<void> {
    const response = await fetch('/api/notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (!response.ok) throw new Error('Failed to delete note');
  },

  async updateUserBookState(bookId: string, isRead?: boolean, isInReadingList?: boolean): Promise<UserBookState> {
    const response = await fetch('/api/user-book-states', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId, isRead, isInReadingList }),
    });
    if (!response.ok) throw new Error('Failed to update user book state');
    return response.json();
  },

  // === Shared Collections ===
  async getCollections(): Promise<LibraryCollection[]> {
    const response = await fetch('/api/collections');
    if (!response.ok) throw new Error('Failed to fetch collections');
    return response.json();
  },

  async createCollection(name: string, description?: string): Promise<LibraryCollection> {
    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!response.ok) throw new Error('Failed to create collection');
    return response.json();
  },

  async updateCollection(id: string, updates: Partial<Pick<LibraryCollection, 'name' | 'description'>>): Promise<LibraryCollection> {
    const response = await fetch('/api/collections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!response.ok) throw new Error('Failed to update collection');
    return response.json();
  },

  async deleteCollection(id: string): Promise<void> {
    const response = await fetch('/api/collections', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('Failed to delete collection');
  },

  // === Books to Acquire ===
  async getBooksToAcquire(): Promise<AcquiredBookNote[]> {
    const response = await fetch('/api/books-to-acquire');
    if (!response.ok) throw new Error('Failed to fetch books to acquire');
    return response.json();
  },

  async addBookToAcquire(book: Partial<AcquiredBookNote> & Pick<AcquiredBookNote, 'title'>): Promise<AcquiredBookNote> {
    const response = await fetch('/api/books-to-acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(book),
    });
    if (!response.ok) throw new Error('Failed to add book to acquire list');
    return response.json();
  },

  async updateBookToAcquire(id: string, updates: Partial<Omit<AcquiredBookNote, 'id' | 'userId' | 'createdAt'>>): Promise<AcquiredBookNote> {
    const response = await fetch('/api/books-to-acquire', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!response.ok) throw new Error('Failed to update book to acquire');
    return response.json();
  },

  async deleteBookToAcquire(id: string): Promise<void> {
    const response = await fetch('/api/books-to-acquire', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('Failed to delete book from acquire list');
  },
};