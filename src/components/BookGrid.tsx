'use client';

import { BookMetadata } from '@/app/types/book';

interface BookGridProps {
    books: BookMetadata[];
    onBookClick: (book: BookMetadata) => void;
}

function BookGrid({ books, onBookClick }: BookGridProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
            {books.map((book) => (
                <div
                    key={book.id}
                    className="group cursor-pointer transition-transform hover:scale-105"
                    onClick={() => onBookClick(book)}
                >
                    <div className="bg-gray-200 rounded-lg overflow-hidden shadow-md" style={{ aspectRatio: '3 / 4' }}>
                        {book.coverImage ? (
                            <img
                                src={book.coverImage}
                                alt={book.title}
                                className="w-full h-full object-cover"

                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                                <span className="text-white text-sm font-medium text-center px-2">
                                    {book.title.slice(0, 20)}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="mt-2 space-y-1">
                        <h3 className="text-black font-medium text-sm leading-tight line-clamp-2">
                            {book.title}
                        </h3>
                        <p className="text-gray-500 text-xs">
                            {book.author}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {book.genres && (
                                <>
                                    {book.genres.map((genre, index) => (
                                        <span
                                            key={index}
                                            className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
                                        >
                                            {genre.trim()}
                                        </span>
                                    ))}
                                    {book.genres.length > 2 && (
                                        <span className="text-gray-400 text-xs">
                                            +{book.genres.length - 2}
                                        </span>
                                    )}</>

                            )}
                            {book.collections && (
                                <>
                                    {
                                        book.collections.map((genre, index) => (
                                            <span
                                                key={index}
                                                className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full"
                                            >
                                                {genre.trim()}
                                            </span>
                                        ))
                                    }
                                    {book.collections.length > 2 && (
                                        <span className="text-gray-400 text-xs">
                                            +{book.collections.length - 2}
                                        </span>
                                    )}</>
                            )}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default BookGrid;