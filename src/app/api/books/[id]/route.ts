import { NextRequest, NextResponse } from 'next/server';
import { BookMetadata, LibraryData } from '@/app/types/book';
import { getGoogleDriveClient, getLibraryMetadata, saveLibraryMetadata } from '@/lib/googleDrive';
import { auth } from '../../auth/[...nextauth]/route';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

async function getLibraryData(drive: any): Promise<LibraryData> {
  try {
    const data = await getLibraryMetadata(drive, GOOGLE_DRIVE_FOLDER_ID);
    return {
      books: data.books || [], notes: data.notes || [], userBookStates: data.userBookStates || []
    };
  } catch (error) {
    console.error('Error fetching library data:', error);
    return { books: [], notes: [], userBookStates: [] };
  }
}

async function saveLibraryData(drive: any, data: LibraryData) {
  await saveLibraryMetadata(drive, GOOGLE_DRIVE_FOLDER_ID, data);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const drive = await getGoogleDriveClient(false);
    const libraryData = await getLibraryData(drive);
    const book = libraryData.books.find(b => b.id === id);
    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }
    return NextResponse.json(book);
  } catch (error) {
    console.error('Error fetching book:', error);
    return NextResponse.json({ error: 'Failed to fetch book' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(false); // Use service account

    const { id } = await params;
    const updatedBook: BookMetadata = await request.json();
    if (!updatedBook.id) {
      return NextResponse.json(
        { error: 'Book ID is required for updating' },
        { status: 400 }
      );
    }

    if (updatedBook.id !== id) {
      return NextResponse.json(
        { error: 'Book ID in body does not match ID in URL' },
        { status: 400 }
      );
    }

    const libraryData = await getLibraryData(drive);
    const bookIndex = libraryData.books.findIndex((book) => book.id === id);

    if (bookIndex === -1) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }
    libraryData.books[bookIndex] = {
      ...libraryData.books[bookIndex],
      ...updatedBook,
      updatedAt: new Date().toISOString(),
    };

    await saveLibraryData(drive, libraryData);

    return NextResponse.json(libraryData.books[bookIndex]);
  } catch (error) {
    console.error('Error updating book:', error);
    return NextResponse.json(
      { error: 'Failed to update book' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(false); // Use service account

    const { id } = await params;

    const libraryData = await getLibraryData(drive);
    const initialLength = libraryData.books.length;
    const updatedBooks = libraryData.books.filter((book) => book.id !== id);

    if (initialLength === updatedBooks.length) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    libraryData.books = updatedBooks;
    await saveLibraryData(drive, libraryData);

    return NextResponse.json(
      { message: 'Book deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting book:', error);
    return NextResponse.json(
      { error: 'Failed to delete book' },
      { status: 500 }
    );
  }
}
