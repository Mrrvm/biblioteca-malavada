import { NextRequest, NextResponse } from 'next/server';
import { LibraryData, AcquiredBookNote } from '@/app/types/book';
import { 
  getGoogleDriveClient, 
  getLibraryMetadata, 
  saveLibraryMetadata, 
  normalizeLibraryData 
} from '@/lib/googleDrive';
import { auth } from '../auth/[...nextauth]/route';

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

export async function GET() {
  try {
    const drive = await getGoogleDriveClient(false);
    const libraryData = await getLibraryData(drive);
    return NextResponse.json(libraryData.booksToAcquire);
  } catch (error) {
    console.error('Error fetching books to acquire:', error);
    return NextResponse.json(
      { error: 'Failed to fetch books to acquire' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(true);

    const { title, author, isbn, notes, priority } = await request.json();
    if (!title) {
      return NextResponse.json(
        { error: 'Book title is required' },
        { status: 400 }
      );
    }

    const id = `acquire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newItem: AcquiredBookNote = {
      id,
      userId: session.user.id,
      title,
      author,
      isbn,
      notes,
      priority: priority || 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const libraryData = await getLibraryData(drive);
    libraryData.booksToAcquire.push(newItem);
    await saveLibraryData(drive, libraryData);
    return NextResponse.json(newItem);
  } catch (error) {
    console.error('Error adding book to acquire list:', error);
    return NextResponse.json(
      { error: 'Failed to add book to acquire list' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(true);

    const { id, title, author, isbn, notes, priority } = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    const libraryData = await getLibraryData(drive);
    const itemIndex = libraryData.booksToAcquire.findIndex(item => item.id === id);
    if (itemIndex === -1) {
      return NextResponse.json(
        { error: 'Book to acquire not found' },
        { status: 404 }
      );
    }

    libraryData.booksToAcquire[itemIndex] = {
      ...libraryData.booksToAcquire[itemIndex],
      title: title ?? libraryData.booksToAcquire[itemIndex].title,
      author: author !== undefined ? author : libraryData.booksToAcquire[itemIndex].author,
      isbn: isbn !== undefined ? isbn : libraryData.booksToAcquire[itemIndex].isbn,
      notes: notes !== undefined ? notes : libraryData.booksToAcquire[itemIndex].notes,
      priority: priority ?? libraryData.booksToAcquire[itemIndex].priority,
      updatedAt: new Date().toISOString(),
    };
    await saveLibraryData(drive, libraryData);
    return NextResponse.json(libraryData.booksToAcquire[itemIndex]);
  } catch (error) {
    console.error('Error updating book to acquire:', error);
    return NextResponse.json(
      { error: 'Failed to update book to acquire' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(true);

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    const libraryData = await getLibraryData(drive);
    const initialLength = libraryData.booksToAcquire.length;
    libraryData.booksToAcquire = libraryData.booksToAcquire.filter(item => item.id !== id);
    if (initialLength === libraryData.booksToAcquire.length) {
      return NextResponse.json({ error: 'Book to acquire not found' }, { status: 404 });
    }

    await saveLibraryData(drive, libraryData);
    return NextResponse.json({ message: 'Book removed from acquire list' });
  } catch (error) {
    console.error('Error deleting book to acquire:', error);
    return NextResponse.json(
      { error: 'Failed to delete book from acquire list' },
      { status: 500 }
    );
  }
}
