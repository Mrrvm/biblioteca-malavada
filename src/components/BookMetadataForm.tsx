'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookMetadata } from '@/app/types/book';

export const bookSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  author: z.string().min(1, 'Author is required'),
  date: z.string().optional(),
  publicationDate: z.string().optional(),
  genres: z.array(z.string()).optional(),
  description: z.string().optional(),
  isbn: z.string().optional(),
  publisher: z.string().optional(),
  language: z.string().optional(),
  pages: z.number().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  collections: z.array(z.string()).optional(),
});


interface BookMetadataFormProps {
  book: BookMetadata;
  onSubmit: (data: z.infer<typeof bookSchema>) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
}

export function BookMetadataForm({ book, onSubmit, onCancel, isSubmitting, isEditing }: BookMetadataFormProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof bookSchema>>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      title: book.title,
      author: book.author,
      date: book.date || '',
      publicationDate: book.publicationDate || '',
      genres: book.genres || [],
      description: book.description || '',
      publisher: book.publisher || '',
      language: book.language || '',
      pages: book.pages,
      location: book.location || '',
      notes: book.notes || '',
      isbn: book.isbn || '',
      collections: book.collections || [],
    },
  });

  const handleFormSubmit = async (data: z.infer<typeof bookSchema>) => {
    const dataToSubmit = {
      ...data,
      collections: data.collections || [],
      genres: data.genres || [],
    };
    try {
      await onSubmit(dataToSubmit);
      onCancel();
    } catch (error) {
      console.error('Error updating book:', error);
    }
  };

  if (!isEditing) {
    return (
      <div className="space-y-4  text-sm">
        {book.description && (

          <p className="text-gray-900 leading-relaxed">
            {book.description.length > 200 && !isDescriptionExpanded
              ? `${book.description.substring(0, 200)}...`
              : book.description}
            {book.description.length > 200 && (
              <button
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                className="cursor-pointer text-blue-500 hover:underline ml-1"
              >
                {isDescriptionExpanded ? 'read less' : 'read more'}
              </button>
            )}
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">

          {book.publisher && (
            <div>
              <span className="font-medium text-gray-500">Publisher</span>
              <p className="text-gray-900">{book.publisher}</p>
            </div>
          )}
          {book.publicationDate && (
            <div>
              <span className="font-medium text-gray-500">Published</span>
              <p className="text-gray-900">{book.publicationDate}</p>
            </div>
          )}

        </div>
        <div className="grid grid-cols-3 gap-4">
          {book.language && (
            <div>
              <span className="font-medium text-gray-500">Language</span>
              <p className="text-gray-900">
                {book.language === 'en' ? 'English' : book.language === 'pt' ? 'Portuguese' : book.language === 'es' ? 'Spanish' : book.language === 'nl' ? 'Dutch' : book.language === 'fr' ? 'French' : book.language}
              </p>
            </div>
          )}
          {book.pages && (
            <div>
              <span className="font-medium text-gray-500">Pages</span>
              <p className="text-gray-900">{book.pages}</p>
            </div>
          )}
          {book.isbn && (
            <div>
              <span className="font-medium text-gray-500">ISBN</span>
              <p className="text-gray-900">{book.isbn}</p>
            </div>
          )}
        </div>
        {book.genres && (
          <div>
            <span className="font-medium text-gray-500">Genres</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {book.genres.map((genre, index) => (
                <span
                  key={index}
                  className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full"
                >
                  {genre.trim()}
                </span>
              ))}
            </div>
          </div>
        )}
        {book.collections && book.collections.length > 0 && (
          <div>
            <span className="font-medium text-gray-500">Collections</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {book.collections.map((collection, index) => (
                <span
                  key={index}
                  className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full"
                >
                  {collection}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 mb-4">
      <div className="flex justify-between items-center">
        <div className="space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer text-sm px-2 py-1 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="cursor-pointer text-sm px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            {...register('title')}
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
          {errors.title && (
            <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Author
          </label>
          <input
            {...register('author')}
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
          {errors.author && (
            <p className="text-red-500 text-sm mt-1">{errors.author.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ISBN
          </label>
          <input
            {...register('isbn')}
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Publisher
          </label>
          <input
            {...register('publisher')}
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          {...register('description')}
          rows={3}
          className="w-full h-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
        />
      </div>

      <div className="flex flex-row gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Publication Date
          </label>
          <input
            {...register('publicationDate')}
            type="date"
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Language
          </label>
          <select
            {...register('language')}
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          >
            <option value="pt">Portuguese</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="nl">Dutch</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pages
          </label>
          <input
            {...register('pages', { valueAsNumber: true })}
            type="number"
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>

      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Genres
          </label>
          <input
            {...register('genres')}
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            placeholder="Comma-separated values"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Collections
          </label>
          <input
            {...register('collections')}
            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          {...register('notes')}
          rows={2}
          className="w-full h-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
        />
      </div>
    </form>
  );
}