import { BookMetadata } from '@/app/types/book';
export async function searchCoverImage(book: BookMetadata): Promise<string> {
    try {
        const googleBooksApiKey = process.env.GOOGLE_BOOKS_API_KEY;

        const runGoogleBooksCover = async (withKey: boolean): Promise<string | null> => {
            try {
                const queryParts: string[] = [];
                if (book.title) queryParts.push(`intitle:${book.title}`);
                if (book.author) queryParts.push(`inauthor:${book.author}`);
                let query = queryParts.length > 0 ? queryParts.join(' ') : (book.isbn ? `isbn:${book.isbn}` : book.title);
                if (book.isbn) query = `isbn:${book.isbn}`;
                const encodedQuery = encodeURIComponent(query);
                const key = withKey && googleBooksApiKey ? `&key=${googleBooksApiKey}` : '';
                const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodedQuery}&maxResults=1${key}`;
                const searchResponse = await fetch(searchUrl);
                if (searchResponse.ok) {
                    const data = await searchResponse.json();
                    if (data.items && data.items[0] && data.items[0].volumeInfo.imageLinks) {
                        const links = data.items[0].volumeInfo.imageLinks;
                        const pick = links.extraLarge || links.large || links.medium || links.thumbnail || links.small;
                        if (pick) {
                            const normalized = pick.replace('http:', 'https:').replace(/&edge=curl/g, '').replace(/zoom=\d+/, 'zoom=2');
                            try {
                                const testResp = await fetch(normalized, { method: 'HEAD' });
                                if (testResp.ok) return normalized;
                            } catch (_) { /* head check failed, still return it optimistically */ return normalized; }
                        }
                    }
                }
            } catch (gbError) {
                console.warn('Google Books cover image search failed:', gbError);
            }
            return null;
        };

        if (googleBooksApiKey) {
            const gb = await runGoogleBooksCover(true);
            if (gb) return gb;
        }

        const gbFallback = await runGoogleBooksCover(false);
        if (gbFallback) return gbFallback;

        if (book.isbn) {
            try {
                const coverImageUrl = `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg?default=false`;
                const response = await fetch(coverImageUrl, { method: 'HEAD' });
                if (response.ok) return coverImageUrl;
            } catch (openLibError) {
                console.warn('Open Library ISBN cover image search failed:', openLibError);
            }
            try {
                const ltUrl = `https://covers.librarything.com/devkey/LTKEY/large/isbn/${book.isbn}`;
                const noKeyUrl = `https://librarything.com/isbn/${book.isbn}/cover/600`;
                const resp = await fetch(noKeyUrl, { method: 'HEAD', redirect: 'manual' });
                if (resp.status === 200 || resp.status === 301 || resp.status === 302) {
                    const loc = resp.headers.get('location');
                    if (loc && /\.(jpg|jpeg|png|webp)/i.test(loc)) {
                        return loc.startsWith('http') ? loc : `https://librarything.com${loc}`;
                    }
                    return noKeyUrl;
                }
            } catch (_) { /* ignore LibraryThing fallback */ }
        }

        try {
            const searchQuery = new URLSearchParams();
            if (book.isbn) searchQuery.set('isbn', book.isbn);
            else {
                if (book.title) searchQuery.set('title', book.title);
                if (book.author) searchQuery.set('author', book.author);
            }
            const olSearchResponse = await fetch(
                `https://openlibrary.org/search.json?${searchQuery.toString()}&limit=1`
            );
            if (olSearchResponse.ok) {
                const olSearchData = await olSearchResponse.json();
                if (olSearchData.docs && olSearchData.docs.length > 0) {
                    const doc = olSearchData.docs[0];
                    if (doc.cover_i) {
                        const olidCoverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`;
                        const olidResponse = await fetch(olidCoverUrl, { method: 'HEAD' });
                        if (olidResponse.ok) return olidCoverUrl;
                    }
                    if (doc.isbn && doc.isbn.length > 0 && !book.isbn) {
                        const isbnFromSearch = doc.isbn[0];
                        const isbnCoverUrl = `https://covers.openlibrary.org/b/isbn/${isbnFromSearch}-L.jpg?default=false`;
                        const isbnResponse = await fetch(isbnCoverUrl, { method: 'HEAD' });
                        if (isbnResponse.ok) return isbnCoverUrl;
                    }
                }
            }
        } catch (olSearchError) {
            console.warn('Open Library search for cover failed:', olSearchError);
        }

        return '';
    } catch (error) {
        console.error('Error searching for cover image:', error);
        return '';
    }
}