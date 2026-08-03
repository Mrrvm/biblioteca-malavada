'use client';

import { useState, useRef, useEffect } from 'react';
import { bookApi } from '@/lib/api/books';
import { UploadBookRequest } from '@/app/types/book';
import { extractBookMetadata } from '@/lib/metadataExtractor';
import { CameraIcon, ImageSquare, XIcon } from '@phosphor-icons/react';
import MultiSelect from './MultiSelect';

interface UploadBookProps {
    onUploadComplete?: (newBook: any) => void;
    collectionsOptions?: string[];
    genresOptions?: string[];
}

export function UploadBook({ onUploadComplete, collectionsOptions = [], genresOptions = [] }: UploadBookProps) {
    const [uploading, setUploading] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [customCover, setCustomCover] = useState<File | null>(null);
    const [customCoverPreview, setCustomCoverPreview] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [metadata, setMetadata] = useState<UploadBookRequest['metadata'] & { pages: string }>({
        title: '',
        author: '',
        fileType: 'epub',
        collections: [],
        genres: [],
        publicationDate: '',
        isbn: '',
        publisher: '',
        description: '',
        pages: '',
        language: '',
        notes: '',
        date: '',
    });

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
                    console.warn('Failed to get camera stream, falling back to file input:', e);
                    setIsCameraModalOpen(false);
                    cameraInputRef.current?.click();
                }
            })();
        }
    }, [isCameraModalOpen]);

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
            const coverFile = new File([blob], 'camera-cover.jpg', { type: 'image/jpeg' });
            handleCustomCoverChange(coverFile);
            setIsCameraModalOpen(false);
        }, 'image/jpeg', 0.92);
    };

    const handleFileChange = async (selectedFile: File) => {
        setFile(selectedFile);
        setExtracting(true);

        try {
            const extractedMetadata = await extractBookMetadata(selectedFile, selectedFile.name);

            setMetadata(prev => ({
                ...prev,
                title: extractedMetadata.title || prev.title,
                author: extractedMetadata.author || prev.author,
                isbn: extractedMetadata.isbn || prev.isbn,
                publisher: extractedMetadata.publisher || prev.publisher,
                publicationDate: extractedMetadata.publicationDate || prev.publicationDate,
                description: extractedMetadata.description || prev.description,
                pages: extractedMetadata.pages ? String(extractedMetadata.pages) : prev.pages,
                language: extractedMetadata.language || prev.language,
                genres: extractedMetadata.genres || prev.genres,
                collections: extractedMetadata.collections || prev.collections,
                date: extractedMetadata.date || prev.date,
            }));

            const extension = selectedFile.name.split('.').pop()?.toLowerCase();
            if (extension === 'pdf') {
                setMetadata(prev => ({ ...prev, fileType: 'pdf' as const }));
            } else if (extension === 'epub') {
                setMetadata(prev => ({ ...prev, fileType: 'epub' as const }));
            } else if (extension === 'acsm') {
                setMetadata(prev => ({ ...prev, fileType: 'acsm' as const }));
            }
        } catch (error) {
            console.error('Error extracting metadata:', error);
        } finally {
            setExtracting(false);
        }
    };

    const handleCustomCoverChange = (coverFile: File) => {
        setCustomCover(coverFile);
        const reader = new FileReader();
        reader.onload = (e) => {
            setCustomCoverPreview(e.target?.result as string);
        };
        reader.readAsDataURL(coverFile);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        const pagesNum = metadata.pages ? Number(metadata.pages) : undefined;

        try {
            const newBook = await bookApi.uploadBook(
                {
                    metadata: {
                        ...metadata,
                        pages: pagesNum,
                    }
                },
                metadata.fileType === 'physical' ? undefined : file!,
                customCover || undefined
            );

            setFile(null);
            setCustomCover(null);
            setCustomCoverPreview(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (coverInputRef.current) coverInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
            setMetadata({
                title: '',
                author: '',
                fileType: 'epub',
                collections: [],
                genres: [],
                publicationDate: '',
                isbn: '',
                publisher: '',
                description: '',
                pages: '',
                language: '',
                notes: '',
                date: '',
            });
            onUploadComplete?.(newBook);
        } catch (error) {
            console.error('Upload failed:', error);
            alert(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className='flex flex-col gap-1 w-full'>
                <label className="text-sm font-medium text-gray-700">Book Type</label>
                <select
                    className='h-10 px-2 border border-gray-300 rounded-md text-gray-900'
                    value={metadata.fileType}
                    onChange={(e) => setMetadata({ ...metadata, fileType: e.target.value as UploadBookRequest['metadata']['fileType'] })}
                >
                    <option value="epub">EPUB</option>
                    <option value="pdf">PDF</option>
                    <option value="acsm">ACSM</option>
                    <option value="physical">Physical</option>
                </select>
            </div>

            {metadata.fileType !== 'physical' ? (
                <div className='flex flex-col gap-1 w-full'>
                    <label className="text-sm font-medium text-gray-700">File</label>
                    <input
                        ref={fileInputRef}
                        className='h-10 px-2 border border-gray-300 rounded-md py-1 text-sm text-gray-900'
                        type="file"
                        accept=".epub,.pdf,.acsm"
                        onChange={(e) => {
                            const selectedFile = e.target.files?.[0];
                            if (selectedFile) handleFileChange(selectedFile);
                        }}
                    />
                    {extracting && <p className="text-sm text-blue-600 mt-1">Extracting metadata...</p>}
                </div>
            ) : (
                // Physical books – we removed the Location field
                <div className='flex flex-col gap-1 w-full'>
                    <p className="text-sm text-gray-500">Physical book – no file required.</p>
                </div>
            )}

            {/* Custom Cover Upload Section */}
            <div className='flex flex-col gap-2 w-full p-4 border border-gray-200 rounded-lg bg-gray-50'>
                <label className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                    <ImageSquare size={20} /> Cover Image (Saved to images/)
                </label>
                <div className="flex flex-wrap gap-3 items-center">
                    <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        className="cursor-pointer flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors text-sm"
                    >
                        <ImageSquare size={18} /> Upload Cover
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
                                setIsCameraModalOpen(true);
                            } else {
                                cameraInputRef.current?.click();
                            }
                        }}
                        className="cursor-pointer flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors text-sm"
                    >
                        <CameraIcon size={18} /> Take Photo
                    </button>
                    {customCover && (
                        <button
                            type="button"
                            onClick={() => {
                                setCustomCover(null);
                                setCustomCoverPreview(null);
                                if (coverInputRef.current) coverInputRef.current.value = '';
                                if (cameraInputRef.current) cameraInputRef.current.value = '';
                            }}
                            className="cursor-pointer text-xs text-red-600 hover:text-red-800 underline"
                        >
                            Remove Cover
                        </button>
                    )}
                    <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            const selectedFile = e.target.files?.[0];
                            if (selectedFile) handleCustomCoverChange(selectedFile);
                        }}
                    />
                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                            const selectedFile = e.target.files?.[0];
                            if (selectedFile) handleCustomCoverChange(selectedFile);
                        }}
                    />
                </div>
                {customCoverPreview && (
                    <div className="mt-2 border border-gray-200 rounded overflow-hidden w-32 h-48 bg-gray-100">
                        <img src={customCoverPreview} alt="Custom cover preview" className="w-full h-full object-cover" />
                    </div>
                )}
            </div>

            <div className='flex flex-row gap-4'>
                <div className='flex flex-col gap-1 w-full'>
                    <label className="text-sm font-medium text-gray-700">Title</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md text-gray-900'
                        type="text"
                        value={metadata.title}
                        onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                        required
                    />
                </div>
                <div className='flex flex-col gap-1 w-full'>
                    <label className="text-sm font-medium text-gray-700">Author</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md text-gray-900'
                        type="text"
                        value={metadata.author}
                        onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                        required
                    />
                </div>
            </div>

            <div className='flex flex-row gap-4'>
                <div className='flex flex-col gap-1 w-full'>
                    <label className="text-sm font-medium text-gray-700">ISBN</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md text-gray-900'
                        type="text"
                        value={metadata.isbn}
                        onChange={(e) => setMetadata({ ...metadata, isbn: e.target.value })}
                    />
                </div>
                <div className='flex flex-col gap-1 w-full'>
                    <label className="text-sm font-medium text-gray-700">Publisher</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md text-gray-900'
                        type="text"
                        value={metadata.publisher}
                        onChange={(e) => setMetadata({ ...metadata, publisher: e.target.value })}
                    />
                </div>
            </div>

            <div className='flex flex-col gap-1 w-full'>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea
                    className='h-16 p-2 border border-gray-300 rounded-md text-gray-900 text-sm'
                    value={metadata.description}
                    onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                    rows={3}
                />
            </div>

            <div className='flex flex-row gap-4'>
                <div className='flex flex-col gap-1 w-full'>
                    <label className="text-sm font-medium text-gray-700">Publication Year</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md text-gray-900'
                        type="number"
                        min="1000"
                        max={new Date().getFullYear()}
                        placeholder="e.g. 2024"
                        value={metadata.publicationDate}
                        onChange={(e) => setMetadata({ ...metadata, publicationDate: e.target.value })}
                    />
                </div>
                <div className='flex flex-col gap-1 w-full'>
                    <label className="text-sm font-medium text-gray-700">Language</label>
                    <select
                        className='h-10 px-2 border border-gray-300 rounded-md text-gray-900'
                        value={metadata.language}
                        onChange={(e) => setMetadata({ ...metadata, language: e.target.value })}
                    >
                        <option value="">Select...</option>
                        <option value="pt">Portuguese</option>
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="nl">Dutch</option>
                    </select>
                </div>
                <div className='flex flex-col gap-1 w-full'>
                    <label className="text-sm font-medium text-gray-700">Pages</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md text-gray-900'
                        type="number"
                        min="1"
                        value={metadata.pages}
                        onChange={(e) => setMetadata({ ...metadata, pages: e.target.value })}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Genres</label>
                <MultiSelect
                    options={genresOptions}
                    selected={metadata.genres}
                    onChange={(v) => setMetadata(prev => ({ ...prev, genres: v }))}
                    placeholder="Search or add a genre…"
                    creatable
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Collections</label>
                <MultiSelect
                    options={collectionsOptions}
                    selected={metadata.collections}
                    onChange={(v) => setMetadata(prev => ({ ...prev, collections: v }))}
                    placeholder="Search or add a collection…"
                    creatable
                />
            </div>

            <div className='flex flex-row w-full gap-4 pt-2'>
                <button
                    className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50"
                    type="submit"
                    disabled={uploading}
                >
                    {uploading ? 'Uploading...' : 'Upload Book'}
                </button>
            </div>

            {isCameraModalOpen && (
                <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4" onClick={() => setIsCameraModalOpen(false)}>
                    <div className="bg-white rounded-lg w-full max-w-lg overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                <CameraIcon size={18} /> Take Cover Photo
                            </h3>
                            <button onClick={() => setIsCameraModalOpen(false)} className="cursor-pointer p-1.5 rounded hover:bg-gray-100 text-gray-600">
                                <XIcon size={18} />
                            </button>
                        </div>
                        <div className="bg-black aspect-[3/4] max-h-[70vh] flex items-center justify-center">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="p-4 flex gap-3 justify-center">
                            <button onClick={() => setIsCameraModalOpen(false)} className="cursor-pointer px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={captureCameraPhoto} className="cursor-pointer px-6 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium">
                                📸 Capture
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
}