import { BookMetadata, UploadBookRequest, LibraryData, BookNote, UserBookState } from '@/app/types/book';

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

  async uploadBook(data: UploadBookRequest, file?: File): Promise<BookMetadata> {
    const formData = new FormData();
    formData.append('metadata', JSON.stringify(data.metadata));
    if (file) {
      formData.append('file', file);
    }
    const response = await fetch(API_BASE, { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Failed to upload book');
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

  async updateBook(id: string, metadata: Partial<BookMetadata>): Promise<BookMetadata> {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!response.ok) throw new Error('Failed to update book');
    return response.json();
  },

  async createNote(bookId: string, text?: string, image?: File): Promise<BookNote> {
    const formData = new FormData();
    formData.append('bookId', bookId);
    if (text) formData.append('text', text);
    if (image) formData.append('image', image);
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
  }
};
