'use client';

import { useState, useEffect } from 'react';
import { bookApi } from '@/lib/api/books';
import { UploadBookRequest } from '@/app/types/book';
import { extractBookMetadata } from '@/lib/metadataExtractor';



interface UploadBookProps {
    onUploadComplete?: () => void;
}

export function UploadBook({ onUploadComplete }: UploadBookProps) {
    const [uploading, setUploading] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        try {
            await bookApi.uploadBook(
                { metadata },
                metadata.fileType === 'physical' ? undefined : file!
            );
            alert('Book uploaded successfully!');
            setFile(null);
            setMetadata({
                title: '',
                author: '',
                fileType: 'epub',
                collections: [],
            });
            onUploadComplete?.();
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Upload failed!');
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
                        value={metadata.language}
                        onChange={(e) => setMetadata({ ...metadata, language: e.target.value })}
                    >
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
                        onChange={(e) => setMetadata({ ...metadata, genres: e.target.value.split(', ') })}
                    />
                </div>
                <div className='flex flex-col gap-1 w-full'>
                    <label>Collections</label>
                    <input
                        className='h-10 px-2 border border-gray-300 rounded-md'
                        type="text"
                        value={metadata.collections?.join(', ') || ''}
                        onChange={(e) => setMetadata({ ...metadata, collections: e.target.value.split(', ') })}
                    />
                </div>
            </div>
            <div className='flex flex-row w-full gap-4'>
                <button className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors" type="submit" disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Upload Book'}
                </button></div>
        </form>
    );
}