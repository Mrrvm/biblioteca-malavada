import { NextRequest, NextResponse } from 'next/server';
import { BookNote, LibraryData } from '@/app/types/book';
import { getGoogleDriveClient, getLibraryMetadata, saveLibraryMetadata, normalizeLibraryData } from '@/lib/googleDrive';
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

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(true);

    const formData = await request.formData();
    const text = formData.get('text') as string | null;
    const bookId = formData.get('bookId') as string;

    if (!bookId) {
      return NextResponse.json({ error: 'Book ID is required' }, { status: 400 });
    }

    const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const note: BookNote = {
      id,
      userId: session.user.id,
      bookId,
      text: text || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const libraryData = await getLibraryData(drive);
    libraryData.notes.push(note);
    await saveLibraryData(drive, libraryData);
    return NextResponse.json(note);
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json(
      { error: 'Failed to create note' },
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

    const libraryData = await getLibraryData(drive);
    const initialLength = libraryData.notes.length;
    libraryData.notes = libraryData.notes.filter((note) => note.id !== id);
    if (libraryData.notes.length === initialLength) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    await saveLibraryData(drive, libraryData);
    return NextResponse.json({ message: 'Note deleted' });
  } catch (error) {
    console.error('Error deleting note:', error);
    return NextResponse.json(
      { error: 'Failed to delete note' },
      { status: 500 }
    );
  }
}