'use client';

import { useState, useEffect, useMemo } from 'react';
import { BookMetadata, LibraryData, BookNote, LibraryCollection } from '@/app/types/book';
import { bookApi } from '@/lib/api/books';
import BookGrid from './BookGrid';
import SearchBar from './SearchBar';
import BookDetailDrawer from './BookDetailDrawer';
import { UploadBook } from './UploadBook';
import MultiSelect from './MultiSelect';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

function Library() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [libraryData, setLibraryData] = useState<LibraryData>({ books: [], notes: [], userBookStates: [], collections: [], booksToAcquire: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<BookMetadata | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  useEffect(() => {
    loadLibraryData();
  }, []);

  useEffect(() => {
    if (selectedBook) {
      const book = libraryData.books.find(book => book.id === selectedBook.id);
      if (book) {
        setSelectedBook(book);
      }
    }
  }, [libraryData.books]);

  const loadLibraryData = async () => {
    try {
      setLoading(true);
      const data = await bookApi.getLibraryData();
      setLibraryData(data);
    } catch (err) {
      setError('Failed to load library data');
      console.error('Error loading library data:', err);
    } finally {
      setLoading(false);
    }
  };

  // --- Local state update helpers ---
  const updateBookInState = (updatedBook: BookMetadata) => {
    setLibraryData(prev => ({
      ...prev,
      books: prev.books.map(b => b.id === updatedBook.id ? updatedBook : b),
    }));
  };

  const addNoteInState = (newNote: BookNote) => {
    setLibraryData(prev => ({
      ...prev,
      notes: [...prev.notes, newNote],
    }));
  };

  const deleteNoteInState = (noteId: string) => {
    setLibraryData(prev => ({
      ...prev,
      notes: prev.notes.filter(n => n.id !== noteId),
    }));
  };

  const deleteBookInState = (bookId: string) => {
    setLibraryData(prev => ({
      ...prev,
      books: prev.books.filter(b => b.id !== bookId),
    }));
    setIsDrawerOpen(false);
  };

  const addBookInState = (newBook: BookMetadata) => {
    setLibraryData(prev => ({
      ...prev,
      books: [...prev.books, newBook],
    }));
  };

  const addCollectionInState = (newCollection: LibraryCollection) => {
    setLibraryData(prev => ({
      ...prev,
      collections: [...prev.collections, newCollection],
    }));
  };
  // --- end helpers ---

  const uniqueCollections = useMemo(() => {
    const collections = new Set<string>();
    libraryData.books.forEach(book => book.collections?.forEach(collection => collections.add(collection)));
    return Array.from(collections).sort();
  }, [libraryData.books]);

  const uniqueGenres = useMemo(() => {
    const genres = new Set<string>();
    libraryData.books.forEach(book => book.genres?.forEach(genre => genres.add(genre)));
    return Array.from(genres).sort();
  }, [libraryData.books]);

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim() && selectedCollections.length === 0 && selectedGenres.length === 0) return libraryData.books;

    const query = searchQuery.toLowerCase();
    return libraryData.books.filter(book => {
      const matchesSearch = book.title.toLowerCase().includes(query) || book.author.toLowerCase().includes(query);
      const matchesCollections = selectedCollections.length === 0 ||
        (book.collections?.some(collection => selectedCollections.includes(collection)) ?? false);
      const matchesGenres = selectedGenres.length === 0 ||
        (book.genres?.some(genre => selectedGenres.includes(genre)) ?? false);
      return matchesSearch && matchesCollections && matchesGenres;
    });
  }, [libraryData.books, searchQuery, selectedCollections, selectedGenres]);

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

  const handleBookUploaded = (newBook: BookMetadata) => {
    setIsUploadModalOpen(false);
    addBookInState(newBook);
  };

  const handleDeleteBook = async (book: BookMetadata) => {
    try {
      await bookApi.deleteBook(book.id);
      deleteBookInState(book.id);
    } catch (err) {
      console.error('Error deleting book:', err);
      alert('Failed to delete book');
    }
  };

  const handleCreateNote = async (bookId: string, text?: string) => {
    if (!session) return;
    try {
      const newNote = await bookApi.createNote(bookId, text);
      addNoteInState(newNote);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await bookApi.deleteNote(noteId);
      deleteNoteInState(noteId);
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const handleCollectionCreated = (newCollection: LibraryCollection) => {
    addCollectionInState(newCollection);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-2xl mb-4">Error</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadLibraryData}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">biblioteca malavada</h1>
          <div className="flex items-center gap-4">
            {session ? (
              <>
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt={session.user.name || 'User'}
                    className="text-xs w-8 h-8 rounded-full cursor-pointer"
                    onClick={() => router.push('/profile')}
                  />
                )}
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="text-xs cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Upload Book
                </button>
                <button
                  onClick={() => signOut()}
                  className="text-xs cursor-pointer bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn('google')}
                className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by title or author..."
      />
      <main className="p-4 flex-1 flex-col space-y-3 items-start justify-start pb-8">
        <div className="flex flex-wrap gap-3">
          <MultiSelect
            options={uniqueGenres}
            selected={selectedGenres}
            onChange={setSelectedGenres}
            placeholder="All Genres"
            label="Genres"
          />
          <MultiSelect
            options={uniqueCollections}
            selected={selectedCollections}
            onChange={setSelectedCollections}
            placeholder="All Collections"
            label="Collections"
          />
        </div>

        <p className="text-gray-600 text-sm">
          {libraryData.books.length} book{libraryData.books.length !== 1 ? 's' : ''} total
          {searchQuery && ` • ${filteredBooks.length} found`}
        </p>

        {filteredBooks.length === 0 ? (
          <h3 className="text-center text-lg font-medium text-gray-900 mb-2">
            {searchQuery ? 'No books found' : 'No books in your library'}
          </h3>
        ) : (
          <BookGrid books={filteredBooks} onBookClick={handleBookClick} />
        )}
      </main>

      <BookDetailDrawer
        book={selectedBook}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onReadBook={handleReadBook}
        onDeleteBook={session ? handleDeleteBook : undefined}
        onBookUpdated={updateBookInState}
        notes={libraryData.notes.filter(note => note.bookId === (selectedBook?.id || ''))}
        onCreateNote={session ? handleCreateNote : undefined}
        onDeleteNote={session ? handleDeleteNote : undefined}
        allCollections={libraryData.collections}
        allGenres={uniqueGenres}
        onCollectionCreated={handleCollectionCreated}
      />

      {
        isUploadModalOpen && session && (
          <div className="text-black fixed inset-0 bg-opacity-20 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Upload Book</h2>
                  <button
                    onClick={() => setIsUploadModalOpen(false)}
                    className="cursor-pointer p-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <UploadBook
                  onUploadComplete={handleBookUploaded}
                  collectionsOptions={libraryData.collections.map(c => c.name)}
                  genresOptions={uniqueGenres}
                />
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

export default Library;