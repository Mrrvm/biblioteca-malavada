'use client';

import { useState, useEffect, useRef } from 'react';
import { bookApi } from '@/lib/api/books';
import { UploadBookRequest } from '@/app/types/book';
import { extractBookMetadata } from '@/lib/metadataExtractor';
import { CameraIcon, ImageSquare, XIcon } from '@phosphor-icons/react';

interface UploadBookProps {
    onUploadComplete?: () => void;
}

export function UploadBook({ onUploadComplete }: UploadBookProps) {
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

    const [metadata, setMetadata] = useState<UploadBookRequest['metadata']>({
        title: '',
        author: '',
        fileType: 'epub' as const,
        collections: [],
    });

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
                pages: extractedMetadata.pages || prev.pages,
                language: extractedMetadata.language || prev.language,
                genres: extractedMetadata.genres || prev.genres,
                collections: extractedMetadata.collections || prev.collections,
                location: extractedMetadata.location || prev.location,
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
        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setCustomCoverPreview(e.target?.result as string);
        };
        reader.readAsDataURL(coverFile);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        try {
            await bookApi.uploadBook(
                { metadata },
                metadata.fileType === 'physical' ? undefined : file!,
                customCover || undefined
            );
            alert('Book uploaded successfully!');
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
            });
            onUploadComplete?.();
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
                <label>Book Type</label>
                <select
                    className='h-10 px-2 border border-gray-300 rounded-md'
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
                    <label>File</label>
                    <input
                        ref={fileInputRef}
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="file"
                        accept=".epub,.pdf,.acsm"
                        onChange={(e) => {
                            const selectedFile = e.target.files?.[0];
                            if (selectedFile) {
                                handleFileChange(selectedFile);
                            }
                        }}
                    />
                    {extracting && (
                        <p className="text-sm text-blue-600 mt-1">Extracting metadata...</p>
                    )}
                </div>
            ) : <div className='flex flex-col gap-1 w-full'>
                <label>Location</label>
                <input
                    className='h-10 px-2 border border-gray-300 rounded-md'
                    type="text"
                    value={metadata.location || ''}
                    onChange={(e) => setMetadata({ ...metadata, location: e.target.value })}
                    required
                />
            </div>}

            {/* Custom Cover Upload Section */}
            <div className='flex flex-col gap-2 w-full p-4 border border-gray-200 rounded-lg bg-gray-50'>
                <label className="font-semibold text-gray-800 flex items-center gap-2">
                    <ImageSquare size={20} /> Cover Image (Optional)
                </label>
                <p className="text-xs text-gray-500 -mt-1">
                    Upload a custom cover or take a picture with your camera!
                </p>
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
                        <img
                            src={customCoverPreview}
                            alt="Custom cover preview"
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}
            </div>

            <div className='flex flex-row gap-4'>
                <div className='flex flex-col gap-1 w-full'>
                    <label>Title</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="text"
                        value={metadata.title}
                        onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                        required
                    />
                </div>

                <div className='flex flex-col gap-1 w-full'>
                    <label>Author</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="text"
                        value={metadata.author}
                        onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                        required
                    />
                </div></div>

            <div className='flex flex-row gap-4'>
                <div className='flex flex-col gap-1 w-full'>
                    <label>ISBN</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="text"
                        value={metadata.isbn || ''}
                        onChange={(e) => setMetadata({ ...metadata, isbn: e.target.value })}
                    />
                </div>

                <div className='flex flex-col gap-1 w-full'>
                    <label>Publisher</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="text"
                        value={metadata.publisher || ''}
                        onChange={(e) => setMetadata({ ...metadata, publisher: e.target.value })}
                    />
                </div>
            </div>
            <div className='flex flex-col gap-1 w-full'>
                <label>Description</label>
                <textarea
                    className='h-16 px-2 border border-gray-300 rounded-md'
                    value={metadata.description || ''}
                    onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                    rows={3}
                />
            </div>
            <div className='flex flex-row gap-4'>
                <div className='flex flex-col gap-1 w-full'>
                    <label>Publication Date</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="date"
                        value={metadata.publicationDate || ''}
                        onChange={(e) => setMetadata({ ...metadata, publicationDate: e.target.value })}
                        placeholder="YYYY-MM-DD"
                    />
                </div>
                <div className='flex flex-col gap-1 w-full'>
                    <label>Language</label>
                    <select
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        value={metadata.language || ''}
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
                    <label>Pages</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="number"
                        value={metadata.pages || ''}
                        onChange={(e) => setMetadata({ ...metadata, pages: Number(e.target.value) })}
                    />
                </div>
            </div>
            <div className='flex flex-row gap-4'>
                <div className='flex flex-col gap-1 w-full'>
                    <label>Genres</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="text"
                        value={metadata.genres?.join(', ') || ''}
                        onChange={(e) => setMetadata({ ...metadata, genres: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="comma separated"
                    />
                </div>
                <div className='flex flex-col gap-1 w-full'>
                    <label>Collections</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="text"
                        value={metadata.collections?.join(', ') || ''}
                        onChange={(e) => setMetadata({ ...metadata, collections: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="comma separated"
                    />
                </div>
            </div>
            <div className='flex flex-row w-full gap-4'>
                <button className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors" type="submit" disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Upload Book'}
                </button></div>


            {isCameraModalOpen && (
                <div
                    className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4"
                    onClick={() => setIsCameraModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-lg w-full max-w-lg overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                <CameraIcon size={18} /> Take Cover Photo
                            </h3>
                            <button
                                onClick={() => setIsCameraModalOpen(false)}
                                className="cursor-pointer p-1.5 rounded hover:bg-gray-100 text-gray-600"
                            >
                                <XIcon size={18} />
                            </button>
                        </div>
                        <div className="bg-black aspect-[3/4] max-h-[70vh] flex items-center justify-center">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="p-4 flex gap-3 justify-center">
                            <button
                                onClick={() => setIsCameraModalOpen(false)}
                                className="cursor-pointer px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={captureCameraPhoto}
                                className="cursor-pointer px-6 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
                            >
                                📸 Capture
                            </button>
                        </div>
                    </div>
                </div>
            )}
            )
        </form>
    )
}
