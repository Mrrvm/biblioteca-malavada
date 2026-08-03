'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { bookApi } from '@/lib/api/books';
import { AcquiredBookNote, BookMetadata, LibraryCollection, LibraryData } from '@/app/types/book';
import BookGrid from '@/components/BookGrid';
import BookDetailDrawer from '@/components/BookDetailDrawer';
import { ArrowLeft, CaretDown, CaretUp, PencilSimple, Plus, TrashSimple, X } from '@phosphor-icons/react';

type TabKey = 'collections' | 'toAcquire';

export default function Profile() {
  const { data: session } = useSession();
  const router = useRouter();
  const [libraryData, setLibraryData] = useState<LibraryData>({ books: [], notes: [], userBookStates: [], collections: [], booksToAcquire: [] });
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<BookMetadata | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('collections');

  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [editingCollection, setEditingCollection] = useState<LibraryCollection | null>(null);
  const [collectionForm, setCollectionForm] = useState({ name: '', description: '' });
  const [expandedCollectionId, setExpandedCollectionId] = useState<string | null>(null);
  const [isSubmittingCollection, setIsSubmittingCollection] = useState(false);

  const [showAddAcquire, setShowAddAcquire] = useState(false);
  const [editingAcquire, setEditingAcquire] = useState<AcquiredBookNote | null>(null);
  const [acquireForm, setAcquireForm] = useState({ title: '', author: '', isbn: '', notes: '', priority: 'medium' as 'low' | 'medium' | 'high' });
  const [isSubmittingAcquire, setIsSubmittingAcquire] = useState(false);

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

  // --- Local state update helpers ---
  const updateBookInState = (updatedBook: BookMetadata) => {
    setLibraryData(prev => ({
      ...prev,
      books: prev.books.map(b => b.id === updatedBook.id ? updatedBook : b),
    }));
  };

  const updateCollectionInState = (updatedCollection: LibraryCollection) => {
    setLibraryData(prev => ({
      ...prev,
      collections: prev.collections.map(c => c.id === updatedCollection.id ? updatedCollection : c),
    }));
  };

  const addCollectionInState = (newCollection: LibraryCollection) => {
    setLibraryData(prev => ({
      ...prev,
      collections: [...prev.collections, newCollection],
    }));
  };

  const deleteCollectionInState = (collectionId: string) => {
    setLibraryData(prev => ({
      ...prev,
      collections: prev.collections.filter(c => c.id !== collectionId),
    }));
  };

  const addAcquireInState = (newItem: AcquiredBookNote) => {
    setLibraryData(prev => ({
      ...prev,
      booksToAcquire: [...prev.booksToAcquire, newItem],
    }));
  };

  const updateAcquireInState = (updatedItem: AcquiredBookNote) => {
    setLibraryData(prev => ({
      ...prev,
      booksToAcquire: prev.booksToAcquire.map(item => item.id === updatedItem.id ? updatedItem : item),
    }));
  };

  const deleteAcquireInState = (itemId: string) => {
    setLibraryData(prev => ({
      ...prev,
      booksToAcquire: prev.booksToAcquire.filter(item => item.id !== itemId),
    }));
  };
  // --- end helpers ---

  const myCollections = useMemo(() => {
    if (!session?.user?.id) return libraryData.collections;
    return libraryData.collections.sort((a, b) => {
      const aIsMine = a.createdByUserId === session.user.id ? 0 : 1;
      const bIsMine = b.createdByUserId === session.user.id ? 0 : 1;
      if (aIsMine !== bIsMine) return aIsMine - bIsMine;
      return a.name.localeCompare(b.name);
    });
  }, [libraryData.collections, session]);

  const booksForCollection = (collectionName: string) => {
    return libraryData.books.filter(book => book.collections?.includes(collectionName));
  };

  const uniqueGenres = useMemo(() => {
    const genres = new Set<string>();
    libraryData.books.forEach(book => book.genres?.forEach(genre => genres.add(genre)));
    return Array.from(genres).sort();
  }, [libraryData.books]);

  const booksToAcquire = useMemo(() => {
    const mine = session?.user?.id
      ? libraryData.booksToAcquire.filter(b => b.userId === session.user.id)
      : libraryData.booksToAcquire;
    const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
    return [...mine].sort((a, b) => {
      const pa = priorityOrder[a.priority || 'medium'] ?? 1;
      const pb = priorityOrder[b.priority || 'medium'] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [libraryData.booksToAcquire, session]);

  const priorityStyles = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

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

  const openCreateCollection = () => {
    setEditingCollection(null);
    setCollectionForm({ name: '', description: '' });
    setShowCreateCollection(true);
  };

  const openEditCollection = (c: LibraryCollection) => {
    setEditingCollection(c);
    setCollectionForm({ name: c.name, description: c.description || '' });
    setShowCreateCollection(true);
  };

  const submitCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionForm.name.trim()) return;
    setIsSubmittingCollection(true);
    try {
      if (editingCollection) {
        const updated = await bookApi.updateCollection(editingCollection.id, {
          name: collectionForm.name.trim(),
          description: collectionForm.description.trim() || undefined,
        });
        updateCollectionInState(updated);
      } else {
        const created = await bookApi.createCollection(
          collectionForm.name.trim(),
          collectionForm.description.trim() || undefined
        );
        addCollectionInState(created);
      }
      setShowCreateCollection(false);
      setEditingCollection(null);
    } catch (err) {
      console.error('Failed to save collection:', err);
      alert('Failed to save collection');
    } finally {
      setIsSubmittingCollection(false);
    }
  };

  const deleteCollection = async (c: LibraryCollection) => {
    if (!confirm(`Delete collection "${c.name}"? Books will NOT be deleted, just removed from this collection.`)) return;
    try {
      await bookApi.deleteCollection(c.id);
      deleteCollectionInState(c.id);
      if (expandedCollectionId === c.id) setExpandedCollectionId(null);
    } catch (err) {
      console.error('Failed to delete collection:', err);
      alert('Failed to delete collection');
    }
  };

  const openAddAcquire = () => {
    setEditingAcquire(null);
    setAcquireForm({ title: '', author: '', isbn: '', notes: '', priority: 'medium' });
    setShowAddAcquire(true);
  };

  const openEditAcquire = (item: AcquiredBookNote) => {
    setEditingAcquire(item);
    setAcquireForm({
      title: item.title,
      author: item.author || '',
      isbn: item.isbn || '',
      notes: item.notes || '',
      priority: item.priority || 'medium',
    });
    setShowAddAcquire(true);
  };

  const submitAcquire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acquireForm.title.trim()) return;
    setIsSubmittingAcquire(true);
    try {
      const payload = {
        title: acquireForm.title.trim(),
        author: acquireForm.author.trim() || undefined,
        isbn: acquireForm.isbn.trim() || undefined,
        notes: acquireForm.notes.trim() || undefined,
        priority: acquireForm.priority,
      };
      if (editingAcquire) {
        const updated = await bookApi.updateBookToAcquire(editingAcquire.id, payload);
        updateAcquireInState(updated);
      } else {
        const created = await bookApi.addBookToAcquire(payload as any);
        addAcquireInState(created);
      }
      setShowAddAcquire(false);
      setEditingAcquire(null);
    } catch (err) {
      console.error('Failed to save book to acquire:', err);
      alert('Failed to save');
    } finally {
      setIsSubmittingAcquire(false);
    }
  };

  const deleteAcquire = async (item: AcquiredBookNote) => {
    if (!confirm(`Remove "${item.title}" from your acquire list?`)) return;
    try {
      await bookApi.deleteBookToAcquire(item.id);
      deleteAcquireInState(item.id);
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete');
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

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please sign in to view your profile</h2>
        </div>
      </div>
    );
  }

  const TabButton = ({ tab, label, count }: { tab: TabKey; label: string; count?: number }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`cursor-pointer px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab
        ? 'bg-blue-600 text-white shadow-sm'
        : 'text-gray-600 hover:bg-gray-100'
        }`}
    >
      {label}
      {typeof count === 'number' && (
        <span className={`ml-2 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
          }`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 p-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-900">
              <button
                onClick={() => router.push('/')}
                className="cursor-pointer hover:text-blue-600 transition-colors"
              >
                biblioteca malavada
              </button>
            </h1>
            <span className="text-gray-400">/</span>
            <div className="flex items-center gap-3">
              {session.user?.image && (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-8 h-8 rounded-full border border-gray-200"
                />
              )}
              <div>
                <div className="text-sm font-semibold text-gray-900">{session.user?.name}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="flex gap-1 items-center cursor-pointer bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors text-xs"
            >
              <ArrowLeft size={12} />
              Library
            </button>
            <button
              onClick={() => signOut()}
              className="text-xs cursor-pointer bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-3 p-4">
        <div className="pb-3 flex items-center gap-2 border-b border-gray-200 overflow-x-auto">
          <TabButton tab="collections" label="All Collections" count={myCollections.length} />
          <TabButton tab="toAcquire" label="Wishlist" count={booksToAcquire.length} />
        </div>

        {activeTab === 'collections' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xl font-bold text-gray-900">All Collections</div>
              <button
                onClick={openCreateCollection}
                className="text-xs cursor-pointer inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
              >
                <Plus size={12} /> New Collection
              </button>
            </div>

            {myCollections.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <button
                  onClick={openCreateCollection}
                  className="text-xs cursor-pointer inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus size={12} /> Create First Collection
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myCollections.map(collection => {
                  const books = booksForCollection(collection.name);
                  const isMine = collection.createdByUserId === session.user.id;
                  const isExpanded = expandedCollectionId === collection.id;
                  return (
                    <div
                      key={collection.id}
                      className={`bg-white rounded-xl border transition-all ${isExpanded ? 'border-blue-300 ring-2 ring-blue-100 md:col-span-2 lg:col-span-3' : 'border-gray-200 hover:shadow-sm hover:border-gray-300'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div onClick={() => setExpandedCollectionId(isExpanded ? null : collection.id)} className="cursor-pointer flex gap-2 items-center text-lg font-semibold text-gray-900 truncate">
                              {!isExpanded ? <CaretDown size={16} /> : <CaretUp size={16} />}
                              {collection.name}
                            </div>
                          </div>
                          {collection.description && (
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{collection.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="text-xs text-gray-500 p-1">
                            {books.length} book{books.length !== 1 ? 's' : ''}
                          </div>
                          <button
                            onClick={() => openEditCollection(collection)}
                            className="cursor-pointer p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Edit collection"
                          >
                            <PencilSimple size={16} />
                          </button>
                          <button
                            onClick={() => deleteCollection(collection)}
                            className="cursor-pointer p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete collection"
                          >
                            <TrashSimple size={16} />
                          </button>
                        </div>
                      </div>
                      {
                        isExpanded && (
                          <div className="border-t border-gray-100 bg-gray-50/50 p-5 rounded-b-xl">
                            {books.length === 0 ? (
                              <div className="text-center py-8 text-sm text-gray-500">
                                <div className="text-3xl mb-2">📖</div>
                                No books in this collection yet.
                                <div className="mt-2 text-xs text-gray-400">
                                  Go to the library, open a book, and add it to "{collection.name}" from the details drawer.
                                </div>
                              </div>
                            ) : (
                              <BookGrid books={books} onBookClick={handleBookClick} />
                            )}
                          </div>
                        )
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'toAcquire' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Wishlist</h2>
              </div>
              <button
                onClick={openAddAcquire}
                className="text-xs cursor-pointer inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
              >
                <Plus size={12} /> Add Book
              </button>
            </div>

            {booksToAcquire.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <button
                  onClick={openAddAcquire}
                  className="text-xs cursor-pointer inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus size={12} /> Add First Book
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {booksToAcquire.map(item => (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-start gap-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex-shrink-0 pt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border capitalize ${priorityStyles[item.priority || 'medium']}`}>
                        {item.priority || 'medium'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 leading-tight">{item.title}</h3>
                      {item.author && (
                        <div className="text-sm text-gray-600 mt-0.5">by {item.author}</div>
                      )}
                      {item.isbn && (
                        <div className="text-xs text-gray-400 mt-1">ISBN: {item.isbn}</div>
                      )}
                      {item.notes && (
                        <div className="mt-2 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-md p-3 whitespace-pre-wrap">
                          {item.notes}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-gray-400">
                        Added {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex sm:flex-col items-center sm:items-end gap-2">
                      <button
                        onClick={() => openEditAcquire(item)}
                        className="cursor-pointer p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Edit"
                      >
                        <PencilSimple size={16} />
                      </button>
                      <button
                        onClick={() => deleteAcquire(item)}
                        className="cursor-pointer p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove"
                      >
                        <TrashSimple size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {
        showCreateCollection && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !isSubmittingCollection && setShowCreateCollection(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-md font-semibold text-gray-900">
                  {editingCollection ? 'Edit Collection' : 'Create New Collection'}
                </h2>
                <button
                  onClick={() => setShowCreateCollection(false)}
                  disabled={isSubmittingCollection}
                  className="cursor-pointer p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={submitCollection} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Collection Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    value={collectionForm.name}
                    onChange={e => setCollectionForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Latin American Feminist Theory"
                    className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    maxLength={80}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={collectionForm.description}
                    onChange={e => setCollectionForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What's this collection about? Who should read it?"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    maxLength={500}
                  />
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateCollection(false)}
                    disabled={isSubmittingCollection}
                    className="cursor-pointer px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCollection || !collectionForm.name.trim()}
                    className="cursor-pointer px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isSubmittingCollection ? 'Saving…' : editingCollection ? 'Save Changes' : 'Create Collection'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {
        showAddAcquire && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !isSubmittingAcquire && setShowAddAcquire(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-md font-semibold text-gray-900">
                  {editingAcquire ? 'Edit Book to Acquire' : 'Add Book to Acquire'}
                </h2>
                <button
                  onClick={() => setShowAddAcquire(false)}
                  disabled={isSubmittingAcquire}
                  className="cursor-pointer p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={submitAcquire} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    value={acquireForm.title}
                    onChange={e => setAcquireForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Book title"
                    className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                    <input
                      value={acquireForm.author}
                      onChange={e => setAcquireForm(f => ({ ...f, author: e.target.value }))}
                      placeholder="e.g. bell hooks"
                      className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ISBN</label>
                    <input
                      value={acquireForm.isbn}
                      onChange={e => setAcquireForm(f => ({ ...f, isbn: e.target.value }))}
                      placeholder="Optional ID"
                      className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAcquireForm(f => ({ ...f, priority: p }))}
                        className={`cursor-pointer py-2 rounded-md border text-sm font-medium capitalize transition-all ${acquireForm.priority === p
                          ? priorityStyles[p] + ' ring-2 ring-offset-1'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={acquireForm.notes}
                    onChange={e => setAcquireForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Where did you hear about it? Which edition? Price? Bookseller name?"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddAcquire(false)}
                    disabled={isSubmittingAcquire}
                    className="cursor-pointer px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAcquire || !acquireForm.title.trim()}
                    className="cursor-pointer px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isSubmittingAcquire ? 'Saving…' : editingAcquire ? 'Save Changes' : 'Add to List'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      <BookDetailDrawer
        book={selectedBook}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onReadBook={handleReadBook}
        onBookUpdated={updateBookInState}
        notes={libraryData.notes.filter(note => note.bookId === (selectedBook?.id || ''))}
        allCollections={libraryData.collections}
        allGenres={uniqueGenres}
        onCollectionCreated={handleCollectionCreated}
      />
    </div >
  );
}