'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookMetadata } from '@/app/types/book';
import MultiSelect from './MultiSelect';

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
  notes: z.string().optional(),
  collections: z.array(z.string()).optional(),
});

const formSchema = z.object({
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
  notes: z.string().optional(),
  collections: z.union([z.string(), z.array(z.string())]).optional(),
});

type BookFormValues = z.infer<typeof formSchema>;

const csvToArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

const extractYear = (v: unknown): string => {
  if (!v) return '';
  const s = String(v);
  const match = s.match(/(\d{4})/);
  return match ? match[1] : s;
};

interface BookMetadataFormProps {
  book: BookMetadata;
  onSubmit: (data: z.infer<typeof bookSchema>) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
  allGenres?: string[];
}

export function BookMetadataForm({ book, onSubmit, onCancel, isSubmitting, isEditing, allGenres = [] }: BookMetadataFormProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<BookFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: book.title,
      author: book.author,
      date: book.date || '',
      publicationDate: extractYear(book.publicationDate),
      genres: book.genres || [],
      description: book.description || '',
      publisher: book.publisher || '',
      language: book.language || '',
      pages: book.pages,
      notes: book.notes || '',
      isbn: book.isbn || '',
      collections: book.collections && book.collections.length > 0 ? book.collections.join(', ') : '',
    },
  });

  useEffect(() => {
    if (isEditing) {
      reset({
        id: book.id,
        title: book.title,
        author: book.author,
        date: book.date || '',
        publicationDate: extractYear(book.publicationDate),
        genres: book.genres || [],
        description: book.description || '',
        publisher: book.publisher || '',
        language: book.language || '',
        pages: book.pages,
        notes: book.notes || '',
        isbn: book.isbn || '',
        collections: book.collections && book.collections.length > 0 ? book.collections.join(', ') : '',
      });
    }
  }, [isEditing, book, reset]);

  const handleFormSubmit = async (data: BookFormValues) => {
    const parsed = bookSchema.safeParse({
      ...data,
      genres: csvToArray(data.genres),
      collections: csvToArray(data.collections),
    });
    if (!parsed.success) {
      console.error('Validation errors:', parsed.error);
      return;
    }
    await onSubmit(parsed.data);
  };

  const currentYear = new Date().getFullYear();
  const displayPublicationYear = extractYear(book.publicationDate) || '-';

  if (!isEditing) {
    return (
      <div className="space-y-4 text-sm">
        {book.description && (
          <div className="text-gray-900 leading-relaxed">
            {book.description.length > 200 && !isDescriptionExpanded
              ? `${book.description.substring(0, 200)}...`
              : book.description}
            {book.description.length > 200 && (
              <button
                type="button"
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                className="cursor-pointer text-blue-500 hover:underline ml-1"
              >
                {isDescriptionExpanded ? 'read less' : 'read more'}
              </button>
            )}
          </div>
        )}
        {book.genres && book.genres.length > 0 && (
          <div>
            <span className="font-medium text-gray-500">Genres</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {book.genres.map((genre, index) => (
                <span
                  key={index}
                  className="bg-blue-100 text-blue-800 text-sm px-2.5 py-0.5 rounded-full"
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
            <div className="flex flex-wrap gap-1.5 mt-1">
              {book.collections.map((collection, index) => (
                <span
                  key={index}
                  className="bg-green-100 text-green-800 text-sm px-2.5 py-0.5 rounded-full"
                >
                  {collection}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-4">
          {book.publisher && (
            <div>
              <span className="font-medium text-gray-500">Publisher</span>
              <p className="text-gray-900">{book.publisher}</p>
            </div>
          )}
          {book.publicationDate && (
            <div>
              <span className="font-medium text-gray-500">Published</span>
              <p className="text-gray-900">{displayPublicationYear}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-4">
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
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-4">
          {book.isbn && (
            <div>
              <span className="font-medium text-gray-500">Ref</span>
              <p className="text-gray-900">{book.isbn}</p>
            </div>
          )}
          {book.fileType && (
            <div>
              <span className="font-medium text-gray-500">File Type</span>
              <p className="text-gray-900">{book.fileType}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
          <input
            {...register('title')}
            className="w-full h-9 px-2.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.title && <p className="text-red-500 text-xs mt-0.5">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Author</label>
          <input
            {...register('author')}
            className="w-full h-9 px-2.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.author && <p className="text-red-500 text-xs mt-0.5">{errors.author.message}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">ISBN</label>
          <input
            {...register('isbn')}
            className="w-full h-9 px-2.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Publisher</label>
          <input
            {...register('publisher')}
            className="w-full h-9 px-2.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
        <textarea
          {...register('description')}
          rows={3}
          className="w-full p-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Publication Year</label>
          <input
            {...register('publicationDate')}
            type="number"
            min={1000}
            max={currentYear}
            placeholder="e.g. 2024"
            className="w-full h-9 px-2.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Language</label>
          <select
            {...register('language')}
            className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            <option value="pt">Portuguese</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="nl">Dutch</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Pages</label>
          <input
            {...register('pages', { valueAsNumber: true })}
            type="number"
            min={1}
            className="w-full h-9 px-2.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Genres</label>
        <Controller
          name="genres"
          control={control}
          render={({ field }) => (
            <MultiSelect
              options={allGenres}
              selected={Array.isArray(field.value) ? field.value : []}
              onChange={(v) => {
                field.onChange(v);
                setValue('genres', v, { shouldDirty: true });
              }}
              placeholder="Search or add a genre…"
              creatable
              disabled={isSubmitting}
            />
          )}
        />
      </div>

      <div className="flex justify-end items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="cursor-pointer text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}