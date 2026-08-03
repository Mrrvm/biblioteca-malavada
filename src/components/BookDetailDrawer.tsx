'use client';

import { useState, useRef, useEffect } from 'react';
import { BookMetadata, BookNote, LibraryCollection } from '@/app/types/book';
import { BookMetadataForm } from './BookMetadataForm';
import { bookApi } from '@/lib/api/books';
import { CameraIcon, Check, EraserIcon, FolderPlus, ImageSquare, PencilIcon, Plus, XIcon } from '@phosphor-icons/react';
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
    onCreateNote?: (bookId: string, text?: string) => Promise<void>;
    onDeleteNote?: (noteId: string) => Promise<void>;
    allCollections: LibraryCollection[];
    allGenres?: string[];
    onCollectionCreated?: (collection: LibraryCollection) => void;
}

export default function BookDetailDrawer({
    book,
    isOpen,
    onClose,
    onReadBook,
    onDeleteBook,
    onBookUpdated,
    notes,
    onCreateNote,
    onDeleteNote,
    allCollections,
    allGenres,
    onCollectionCreated
}: BookDetailDrawerProps) {
    const { data: session } = useSession();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [newNoteText, setNewNoteText] = useState('');
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [isReading, setIsReading] = useState(false);

    const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
    const [pendingCoverPreview, setPendingCoverPreview] = useState<string | null>(null);

    const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [showCollectionsModal, setShowCollectionsModal] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [newCollectionDescription, setNewCollectionDescription] = useState('');
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);

    const coverFileInputRef = useRef<HTMLInputElement>(null);
    const coverCameraInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isCameraModalOpen) {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
                setCameraStream(null);
            }
        } else {
            (async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' } },
                        audio: false,
                    });
                    setCameraStream(stream);
                    await new Promise(resolve => setTimeout(resolve, 150));
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        await videoRef.current.play().catch(() => { });
                    }
                } catch (e) {
                    console.warn('Failed to get camera stream:', e);
                    setIsCameraModalOpen(false);
                    coverCameraInputRef.current?.click();
                }
            })();
        }
    }, [isCameraModalOpen]);

    if (!book) return null;

    const handleSelectCoverFile = (file: File) => {
        setPendingCoverFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setPendingCoverPreview(e.target?.result as string);
        reader.readAsDataURL(file);
    };

    const captureCameraPhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
            if (!blob) return;
            const file = new File([blob], 'camera-cover.jpg', { type: 'image/jpeg' });
            handleSelectCoverFile(file);
            setIsCameraModalOpen(false);
        }, 'image/jpeg', 0.92);
    };

    const bookCollections = book?.collections || [];

    const toggleCollection = async (collectionName: string, add: boolean) => {
        if (!book || !onBookUpdated) return;
        setIsSubmitting(true);
        try {
            const updated = add
                ? await bookApi.addToCollection(book.id, collectionName)
                : await bookApi.removeFromCollection(book.id, collectionName);
            onBookUpdated(updated);
        } catch (err) {
            console.error('Failed to toggle collection:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateCollection = async () => {
        const name = newCollectionName.trim();
        if (!name || !book) return;
        setIsCreatingCollection(true);
        try {
            const created = await bookApi.createCollection(name, newCollectionDescription.trim() || undefined);
            onCollectionCreated?.(created);
            setNewCollectionName('');
            setNewCollectionDescription('');
            await toggleCollection(name, true);
        } catch (err) {
            console.error('Failed to create collection:', err);
        } finally {
            setIsCreatingCollection(false);
        }
    };

    const handleMetadataUpdate = async (data: z.infer<typeof bookSchema>) => {
        setIsSubmitting(true);
        try {
            const updatedBook = await bookApi.updateBook(
                book.id,
                { ...data, id: book.id },
                pendingCoverFile || undefined
            );

            if (onBookUpdated) {
                onBookUpdated(updatedBook);
            }
            setPendingCoverFile(null);
            setPendingCoverPreview(null);
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
            await onCreateNote(book.id, newNoteText || undefined);
            setNewNoteText('');
            setIsAddingNote(false);
        } catch (error) {
            console.error('Failed to add note:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRead = async () => {
        setIsReading(true);
        try {
            await onReadBook(book);
        } finally {
            setIsReading(false);
        }
    };

    const getCoverUrl = (book: BookMetadata): string | undefined => {
        if (book.coverFileId) {
            return `/api/utils/cover-image?fileId=${book.coverFileId}`;
        }
        return book.coverImage;
    };

    const effectiveCover = pendingCoverPreview || getCoverUrl(book);

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-50 transition-opacity"
                    onClick={onClose}
                />
            )}

            <div
                className={`overflow-y-auto fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-50 ${isOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <div className='flex flex-col h-full p-4'>
                    <div className='flex flex-col gap-4 flex-grow overflow-y-auto mb-4'>

                        {!isEditingMetadata && (
                            <div className='flex flex-row items-start gap-4'>
                                {effectiveCover && (
                                    <img
                                        style={{ aspectRatio: '3 / 4' }}
                                        src={effectiveCover}
                                        alt={book.title}
                                        className="border border-gray-300 rounded-md object-cover max-h-[300px] w-auto"
                                    />
                                )}
                                <div className='flex flex-col h-full justify-between gap-3'>
                                    <div>
                                        <div className="text-lg font-bold text-gray-900 leading-tight">{book.title}</div>
                                        <p className="text-sm text-gray-600 mt-1">{book.author}</p>
                                        <div className='mt-2 flex flex-row gap-2 flex-shrink-0'>
                                            {session && (
                                                <PencilIcon
                                                    onClick={() => { setIsEditingMetadata(true); setPendingCoverPreview(book.coverImage || null); }}
                                                    className="cursor-pointer w-5 h-5 text-gray-600 hover:text-blue-600 transition-colors"
                                                />
                                            )}
                                            {session && onDeleteBook && (
                                                <EraserIcon
                                                    onClick={() => onDeleteBook(book)}
                                                    className="cursor-pointer w-5 h-5 text-gray-600 hover:text-red-600 transition-colors"
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowCollectionsModal(true)}
                                        className={`w-fit cursor-pointer px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${bookCollections.length > 0 ? 'bg-violet-100 text-violet-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                            }`}
                                    >
                                        <FolderPlus size={12} />
                                        {bookCollections.length === 0
                                            ? 'Add to Collection'
                                            : `In ${bookCollections.length} Collection${bookCollections.length !== 1 ? 's' : ''}`}
                                    </button>
                                </div>
                            </div>
                        )}

                        {isEditingMetadata && session && (
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                                <p className="text-xs text-gray-500">
                                    Upload a cover image
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => coverFileInputRef.current?.click()}
                                        className="cursor-pointer flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors text-xs"
                                        disabled={isSubmitting}
                                    >
                                        <ImageSquare size={14} /> Upload Image
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
                                                setIsCameraModalOpen(true);
                                            } else {
                                                coverCameraInputRef.current?.click();
                                            }
                                        }}
                                        className="cursor-pointer flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors text-xs"
                                        disabled={isSubmitting}
                                    >
                                        <CameraIcon size={14} /> Take Photo
                                    </button>
                                    {(pendingCoverPreview || book.coverImage || book.coverFileId) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPendingCoverFile(null);
                                                setPendingCoverPreview(null);
                                            }}
                                            className="cursor-pointer flex items-center gap-1 bg-red-500 text-white px-2 py-1 rounded-md hover:bg-red-600 transition-colors text-xs"
                                        >
                                            Remove Cover
                                        </button>
                                    )}

                                    <input
                                        ref={coverFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) handleSelectCoverFile(f);
                                        }}
                                    />
                                    <input
                                        ref={coverCameraInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) handleSelectCoverFile(f);
                                        }}
                                    />
                                </div>
                                {effectiveCover && (
                                    <div className="mt-2 border border-gray-200 rounded overflow-hidden w-24 bg-gray-100" style={{ aspectRatio: '3 / 4' }}>
                                        <img src={effectiveCover} alt="Cover preview" className="w-full h-full object-cover" />
                                    </div>
                                )}
                            </div>
                        )}

                        <BookMetadataForm
                            book={book}
                            onSubmit={handleMetadataUpdate}
                            onCancel={() => {
                                setIsEditingMetadata(false);
                                setPendingCoverFile(null);
                                setPendingCoverPreview(null);
                            }}
                            isSubmitting={isSubmitting}
                            isEditing={isEditingMetadata}
                            allGenres={allGenres || []}
                        />

                        <div className="border-t border-gray-200"></div>
                        <div className="flex flex-col justify-between gap-3">
                            <div className='flex justify-between items-center'>
                                <h3 className="text-base font-semibold text-gray-900">Notes</h3>
                                {session && onCreateNote && (
                                    <button
                                        onClick={() => setIsAddingNote(!isAddingNote)}
                                        className="cursor-pointer text-blue-600 hover:text-blue-800 text-xs font-medium"
                                    >
                                        {isAddingNote ? 'Cancel' : '+ Add Note'}
                                    </button>
                                )}
                            </div>


                            {isAddingNote && session && onCreateNote && (
                                <div className="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-200">
                                    <textarea
                                        placeholder="Write a note..."
                                        value={newNoteText}
                                        onChange={(e) => setNewNoteText(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded text-sm mb-2 text-gray-900"
                                        rows={3}
                                    />
                                    <button
                                        onClick={handleAddNote}
                                        disabled={isSubmitting}
                                        className="cursor-pointer bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Adding...' : 'Add Note'}
                                    </button>
                                </div>
                            )}

                            <div className="space-y-3">
                                {notes?.map((note) => (
                                    <div key={note.id} className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm">
                                        <p className="text-gray-800">{note.text}</p>
                                        {note.userId === session?.user?.id && onDeleteNote && (
                                            <button
                                                onClick={() => onDeleteNote(note.id)}
                                                className="cursor-pointer text-red-500 text-xs mt-2 hover:text-red-700 font-medium flex w-full justify-end"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {session?.user && book.fileType !== 'physical' && (
                        <button
                            onClick={handleRead}
                            disabled={isReading}
                            className="cursor-pointer w-full bg-blue-600 text-white py-2.5 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isReading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Loading...
                                </>
                            ) : (
                                'Read Book'
                            )}
                        </button>
                    )}
                </div>
            </div>

            {isCameraModalOpen && (
                <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setIsCameraModalOpen(false)}>
                    <div className="bg-white rounded-lg w-full max-w-lg overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                <CameraIcon size={18} /> Take Cover Photo
                            </h3>
                            <button onClick={() => setIsCameraModalOpen(false)} className="cursor-pointer p-1.5 rounded hover:bg-gray-100 text-gray-600">
                                <XIcon size={18} />
                            </button>
                        </div>
                        <div className="bg-black max-h-[70vh] flex items-center justify-center" style={{ aspectRatio: '3 / 4' }}>
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="p-4 flex gap-3 justify-center">
                            <button onClick={() => setIsCameraModalOpen(false)} className="cursor-pointer px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={captureCameraPhoto} className="cursor-pointer px-6 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium">
                                Capture
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCollectionsModal && book && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setShowCollectionsModal(false)}>
                    <div className="bg-white rounded-lg w-full max-w-md overflow-hidden shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                                <FolderPlus size={18} /> Add "{book.title}" to Collection
                            </h3>
                            <button onClick={() => setShowCollectionsModal(false)} className="cursor-pointer p-1.5 rounded hover:bg-gray-100 text-gray-600">
                                <XIcon size={18} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 space-y-4">
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <div className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Create New Collection</div>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        placeholder="Collection name"
                                        value={newCollectionName}
                                        onChange={(e) => setNewCollectionName(e.target.value)}
                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Description (optional)"
                                        value={newCollectionDescription}
                                        onChange={(e) => setNewCollectionDescription(e.target.value)}
                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        onClick={handleCreateCollection}
                                        disabled={!newCollectionName.trim() || isCreatingCollection || isSubmitting}
                                        className="cursor-pointer w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors text-xs font-medium disabled:opacity-50"
                                    >
                                        {isCreatingCollection ? (
                                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        ) : (
                                            <Plus size={16} />
                                        )}
                                        {isCreatingCollection ? 'Creating...' : 'Create & Add Book'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                                    Existing Collections ({allCollections.length})
                                </div>
                                {allCollections.length === 0 ? (
                                    <div className="text-xs text-gray-500 italic p-3 text-center bg-gray-50 rounded border border-dashed border-gray-200">
                                        No collections created yet.
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                        {allCollections.map((c) => {
                                            const isIn = bookCollections.includes(c.name);
                                            return (
                                                <button
                                                    key={c.id}
                                                    onClick={() => toggleCollection(c.name, !isIn)}
                                                    disabled={isSubmitting}
                                                    className={`cursor-pointer w-full text-left px-3 py-2 rounded-md border transition-colors text-xs flex items-center justify-between gap-3 ${isIn ? 'bg-violet-50 border-violet-300 text-violet-900' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-800'
                                                        }`}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="font-medium truncate">{c.name}</div>
                                                        {c.description && <div className="text-[11px] text-gray-500 truncate">{c.description}</div>}
                                                    </div>
                                                    <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${isIn ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-300'
                                                        }`}>
                                                        {isSubmitting ? (
                                                            <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                        ) : (
                                                            isIn && <Check size={12} />
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}