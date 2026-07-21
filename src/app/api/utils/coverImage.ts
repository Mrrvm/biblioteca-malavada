import { BookMetadata } from '@/app/types/book';
export async function searchCoverImage(book: BookMetadata): Promise<string> {
    try {
        if (book.isbn) {
            const coverImageUrl = `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg?default=false`;
            const response = await fetch(coverImageUrl, { method: 'HEAD' });

            if (response.ok) {
                return coverImageUrl;
            }
        }

        // Fallback to Google Books if Open Library doesn't find a cover
        const searchQuery = encodeURIComponent(`${book.title} ${book.author}`);
        const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${searchQuery}&maxResults=1`;

        const searchResponse = await fetch(searchUrl);
        if (searchResponse.ok) {
            const data = await searchResponse.json();
            if (data.items && data.items[0] && data.items[0].volumeInfo.imageLinks) {
                return data.items[0].volumeInfo.imageLinks.thumbnail.replace('http:', 'https:').replace('&edge=curl', '');
            }
        }

        return '';

    } catch (error) {
        console.error('Error searching for cover image:', error);
        return '';
    }
}