import { NextRequest, NextResponse } from 'next/server';
import { LibraryData } from '@/app/types/book';
import { getGoogleDriveClient, getLibraryMetadata, saveLibraryMetadata, normalizeLibraryData } from '@/lib/googleDrive';
import { auth } from '../../../auth/[...nextauth]/route';

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

// POST - Add book to collection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(true); // Use user OAuth client

    const { id } = await params;
    const { collection } = await request.json();

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection name is required' },
        { status: 400 }
      );
    }

    const libraryData = await getLibraryData(drive);
    const bookIndex = libraryData.books.findIndex((b) => b.id === id);

    if (bookIndex === -1) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    // Add collection if not already present
    if (!libraryData.books[bookIndex].collections.includes(collection)) {
      libraryData.books[bookIndex].collections.push(collection);
      libraryData.books[bookIndex].updatedAt = new Date().toISOString();

      await saveLibraryData(drive, libraryData);
    }

    return NextResponse.json(libraryData.books[bookIndex]);
  } catch (error) {
    console.error('Error adding to collection:', error);
    return NextResponse.json(
      { error: 'Failed to add to collection' },
      { status: 500 }
    );
  }
}

// DELETE - Remove book from collection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(true); // Use user OAuth client

    const { id } = await params;
    const { collection } = await request.json();

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection name is required' },
        { status: 400 }
      );
    }

    const libraryData = await getLibraryData(drive);
    const bookIndex = libraryData.books.findIndex((b) => b.id === id);

    if (bookIndex === -1) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    // Remove collection if present
    const collectionIndex = libraryData.books[bookIndex].collections.indexOf(collection);
    if (collectionIndex > -1) {
      libraryData.books[bookIndex].collections.splice(collectionIndex, 1);
      libraryData.books[bookIndex].updatedAt = new Date().toISOString();

      await saveLibraryData(drive, libraryData);
    }

    return NextResponse.json(libraryData.books[bookIndex]);
  } catch (error) {
    console.error('Error removing from collection:', error);
    return NextResponse.json(
      { error: 'Failed to remove from collection' },
      { status: 500 }
    );
  }
}
