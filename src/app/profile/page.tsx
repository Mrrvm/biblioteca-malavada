'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { bookApi } from '@/lib/api/books';
import { BookMetadata, LibraryData, UserBookState } from '@/app/types/book';
import BookGrid from '@/components/BookGrid';
import BookDetailDrawer from '@/components/BookDetailDrawer';

export default function Profile() {
  const { data: session } = useSession();
  const [libraryData, setLibraryData] = useState<LibraryData>({ books: [], notes: [], userBookStates: [] });
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<BookMetadata | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    loadLibraryData();
  }, []);

  const loadLibraryData = async () => {
    try {
      setLoading(true);
      const data = await bookApi.getLibraryData();
      setLibraryData(data);
    } catch (err) {
      console.error('Error loading library data:', err);
    } finally {
      setLoading(false);
    }
  };

  const readingListBooks = useMemo(() => {
    if (!session?.user?.id) return [];
    const userReadingListStates = libraryData.userBookStates.filter(
      state => state.userId === session.user.id && state.isInReadingList
    );
    return userReadingListStates.map(state =>
      libraryData.books.find(book => book.id === state.bookId)
    ).filter(Boolean) as BookMetadata[];
  }, [libraryData, session]);

  const readBooks = useMemo(() => {
    if (!session?.user?.id) return [];
    const userReadStates = libraryData.userBookStates.filter(
      state => state.userId === session.user.id && state.isRead
    );
    return userReadStates.map(state =>
      libraryData.books.find(book => book.id === state.bookId)
    ).filter(Boolean) as BookMetadata[];
  }, [libraryData, session]);

  const handleBookClick = (book: BookMetadata) => {
    setSelectedBook(book);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedBook(null);
  };

  const handleReadBook = async (book: BookMetadata) => {
    if (book.fileType === 'physical') {
      console.log('Viewing physical book details:', book);
    } else {
      try {
        const downloadUrl = await bookApi.downloadBook(book.id);
        window.open(downloadUrl, '_blank');
      } catch (err) {
        console.error('Error downloading book:', err);
        alert('Failed to open book');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please sign in to view your profile</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">
            <button
              onClick={() => window.location.href = '/'}
              className="hover:text-blue-600"
            >
              Biblioteca Malavada
            </button>
          </h1>
          <div className="flex items-center gap-4">
            {session.user?.image && (
              <img
                src={session.user.image}
                alt={session.user.name || 'User'}
                className="w-10 h-10 rounded-full"
              />
            )}
            <span className="text-gray-700 font-medium">{session.user?.name}</span>
            <button
              onClick={() => window.location.href = '/'}
              className="cursor-pointer bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
            >
              Back to Library
            </button>
            <button
              onClick={() => signOut()}
              className="cursor-pointer bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Reading List Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Reading List</h2>
          {readingListBooks.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500">No books in your reading list yet</p>
            </div>
          ) : (
            <BookGrid books={readingListBooks} onBookClick={handleBookClick} />
          )}
        </section>

        {/* Read Books Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Read Books</h2>
          {readBooks.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500">No books marked as read yet</p>
            </div>
          ) : (
            <BookGrid books={readBooks} onBookClick={handleBookClick} />
          )}
        </section>
      </main>

      <BookDetailDrawer
        book={selectedBook}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onReadBook={handleReadBook}
        onBookUpdated={loadLibraryData}
        notes={libraryData.notes.filter(note => note.bookId === (selectedBook?.id || ''))}
        userBookState={session ? libraryData.userBookStates.find(state => state.bookId === (selectedBook?.id || '') && state.userId === session.user?.id) : undefined}
        onUpdateUserBookState={session ? async (bookId, isRead, isInReadingList) => {
          await bookApi.updateUserBookState(bookId, isRead, isInReadingList);
          await loadLibraryData();
        } : undefined}
      />
    </div>
  );
}