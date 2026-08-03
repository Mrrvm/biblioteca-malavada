import { NextRequest, NextResponse } from 'next/server';
import { BookMetadata, LibraryData } from '@/app/types/book';
import { getGoogleDriveClient, getLibraryMetadata, saveLibraryMetadata, normalizeLibraryData, uploadCoverImage } from '@/lib/googleDrive';
import { auth } from '../../auth/[...nextauth]/route';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

async function getLibraryData(drive: any): Promise<LibraryData> {
  try {
    const data = await getLibraryMetadata(drive, GOOGLE_DRIVE_FOLDER_ID);
    return normalizeLibraryData(data);
  } catch (error) {
    console.error('Error fetching library data:', error);
    return normalizeLibraryData({});
  }
}

async function saveLibraryData(drive: any, data: LibraryData) {
  await saveLibraryMetadata(drive, GOOGLE_DRIVE_FOLDER_ID, normalizeLibraryData(data));
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
    const userDrive = await getGoogleDriveClient(true);
    const serviceDrive = await getGoogleDriveClient(false);

    const { id } = await params;
    const formData = await request.formData();
    const metadataJson = formData.get('metadata') as string;
    const coverFile = formData.get('coverFile') as File | null;

    if (!metadataJson) {
      return NextResponse.json({ error: 'Metadata is required' }, { status: 400 });
    }

    const updatedBook: Partial<BookMetadata> = JSON.parse(metadataJson);
    if (updatedBook.id && updatedBook.id !== id) {
      return NextResponse.json({ error: 'ID mismatch' }, { status: 400 });
    }

    const libraryData = await getLibraryData(serviceDrive);
    const bookIndex = libraryData.books.findIndex((b) => b.id === id);
    if (bookIndex === -1) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Handle cover file upload if present
    if (coverFile) {
      const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
      const coverFileId = await uploadCoverImage(userDrive, GOOGLE_DRIVE_FOLDER_ID, id, coverBuffer, coverFile.type);
      updatedBook.coverFileId = coverFileId;
      // Optionally remove old cover file? We'll keep it for now.
    }

    // Merge updates
    libraryData.books[bookIndex] = {
      ...libraryData.books[bookIndex],
      ...updatedBook,
      updatedAt: new Date().toISOString(),
    };

    await saveLibraryData(userDrive, libraryData);
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
    const drive = await getGoogleDriveClient(true);

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