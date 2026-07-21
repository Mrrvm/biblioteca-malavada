'use client';

import { useState } from 'react';
import { BookMetadata, BookNote, UserBookState } from '@/app/types/book';
import { BookMetadataForm } from './BookMetadataForm';
import { bookApi } from '@/lib/api/books';
import { EraserIcon, PencilIcon, XIcon } from '@phosphor-icons/react';
import { useSession } from 'next-auth/react';

import { z } from 'zod';
import { bookSchema } from './BookMetadataForm';

interface BookDetailDrawerProps {
    book: BookMetadata | null;
    isOpen: boolean;
    onClose: () => void;
    onReadBook: (book: BookMetadata) => void;
    onDeleteBook?: (book: BookMetadata) => void;
    onBookUpdated?: (book: BookMetadata) => void;
    notes?: BookNote[];
    userBookState?: UserBookState;
    onUpdateUserBookState?: (bookId: string, isRead?: boolean, isInReadingList?: boolean) => Promise<void>;
    onCreateNote?: (bookId: string, text?: string, image?: File) => Promise<void>;
    onDeleteNote?: (noteId: string) => Promise<void>;
}

function BookDetailDrawer({ book, isOpen, onClose, onReadBook, onDeleteBook, onBookUpdated, notes, userBookState, onUpdateUserBookState, onCreateNote, onDeleteNote }: BookDetailDrawerProps) {
    const { data: session } = useSession();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [newNoteText, setNewNoteText] = useState('');
    const [newNoteImage, setNewNoteImage] = useState<File | null>(null);
    const [isAddingNote, setIsAddingNote] = useState(false);

    if (!book) return null;

    const handleMetadataUpdate = async (data: z.infer<typeof bookSchema>) => {
        setIsSubmitting(true);
        try {
            data.id = book.id;
            const updatedBook = await bookApi.updateBook(book.id, data);
            if (onBookUpdated) {
                onBookUpdated(updatedBook);
            }
            setIsEditingMetadata(false);
        } catch (error) {
            console.error('Failed to update book:', error);
            alert('Failed to update book metadata');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddNote = async () => {
        if (!onCreateNote) return;
        setIsSubmitting(true);
        try {
            await onCreateNote(book.id, newNoteText || undefined, newNoteImage || undefined);
            setNewNoteText('');
            setNewNoteImage(null);
            setIsAddingNote(false);
        } catch (error) {
            console.error('Failed to add note:', error);
            alert('Failed to add note');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-opacity-30 z-50 transition-opacity"
                    onClick={onClose}
                />
            )}

            <div
                className={`overflow-y-auto fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-50 ${isOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <div className='flex flex-col h-full p-6'>
                    <div className='flex flex-col gap-4 flex-grow overflow-y-auto'>
                        <div className='flex flex-row justify-between items-center'>
                            <h1 className="text-2xl font-bold text-gray-900">{book.title}</h1>
                            <div className='flex flex-row gap-2'>
                                {session && <PencilIcon onClick={() => setIsEditingMetadata(true)} className="cursor-pointer w-6 h-6 text-gray-600" />}
                                {session && onDeleteBook && (
                                    <EraserIcon onClick={() => onDeleteBook(book)} className="cursor-pointer w-6 h-6 text-gray-600" />
                                )}
                                <XIcon onClick={onClose} className="cursor-pointer w-6 h-6 text-gray-600" />
                            </div>
                        </div>
                        <p className="text-md text-gray-600">{book.author}</p>

                        {session && onUpdateUserBookState && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => onUpdateUserBookState(book.id, !userBookState?.isRead, userBookState?.isInReadingList)}
                                    className={`px-3 py-1 rounded-full text-sm ${userBookState?.isRead ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                                >
                                    {userBookState?.isRead ? 'Read' : 'Mark as Read'}
                                </button>
                                <button
                                    onClick={() => onUpdateUserBookState(book.id, userBookState?.isRead, !userBookState?.isInReadingList)}
                                    className={`px-3 py-1 rounded-full text-sm ${userBookState?.isInReadingList ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}
                                >
                                    {userBookState?.isInReadingList ? 'In Reading List' : 'Add to Reading List'}
                                </button>
                            </div>
                        )}

                        <BookMetadataForm
                            book={book}
                            onSubmit={handleMetadataUpdate}
                            onCancel={() => setIsEditingMetadata(false)}
                            isSubmitting={isSubmitting}
                            isEditing={isEditingMetadata}
                        />

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
                                {session && onCreateNote && (
                                    <button
                                        onClick={() => setIsAddingNote(!isAddingNote)}
                                        className="text-blue-600 hover:text-blue-800 text-sm"
                                    >
                                        {isAddingNote ? 'Cancel' : '+ Add Note'}
                                    </button>
                                )}
                            </div>

                            {isAddingNote && session && onCreateNote && (
                                <div className="bg-gray-50 p-3 rounded-lg mb-3">
                                    <textarea
                                        placeholder="Write a note..."
                                        value={newNoteText}
                                        onChange={(e) => setNewNoteText(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded mb-2"
                                        rows={3}
                                    />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setNewNoteImage(e.target.files?.[0] || null)}
                                        className="mb-2"
                                    />
                                    <button
                                        onClick={handleAddNote}
                                        disabled={isSubmitting}
                                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                                    >
                                        {isSubmitting ? 'Adding...' : 'Add Note'}
                                    </button>
                                </div>
                            )}

                            <div className="space-y-3">
                                {notes?.map((note) => (
                                    <div key={note.id} className="bg-gray-50 p-3 rounded-lg">
                                        <p className="text-sm text-gray-600">{note.text}</p>
                                        {note.imageUrl && (
                                            <p className="text-xs text-blue-600 mt-1">Image attached</p>
                                        )}
                                        {note.userId === session?.user?.id && onDeleteNote && (
                                            <button
                                                onClick={() => onDeleteNote(note.id)}
                                                className="text-red-500 text-xs mt-2 hover:text-red-700"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => onReadBook(book)}
                        className="cursor-pointer w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                    >
                        {book.fileType === 'physical' ? 'View Details' : 'Read Book'}
                    </button>
                </div>
            </div>
        </>
    );
}

export default BookDetailDrawer;
