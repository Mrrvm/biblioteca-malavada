import { NextRequest, NextResponse } from 'next/server';
import { UserBookState, LibraryData } from '@/app/types/book';
import { getGoogleDriveClient, getLibraryMetadata, saveLibraryMetadata } from '@/lib/googleDrive';
import { auth } from '../auth/[...nextauth]/route';

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

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(false); // Use service account

    const { bookId, isRead, isInReadingList } = await request.json();
    if (!bookId) {
      return NextResponse.json({ error: 'Book ID is required' }, { status: 400 });
    }

    const libraryData = await getLibraryData(drive);
    let stateIndex = libraryData.userBookStates.findIndex((s) => s.userId === session.user!.id && s.bookId === bookId);

    if (stateIndex === -1) {
      libraryData.userBookStates.push({
        userId: session.user.id,
        bookId,
        isRead: isRead || false,
        isInReadingList: isInReadingList || false,
        readAt: isRead ? new Date().toISOString() : undefined,
        addedToListAt: isInReadingList ? new Date().toISOString() : undefined
      });
    } else {
      libraryData.userBookStates[stateIndex] = {
        ...libraryData.userBookStates[stateIndex],
        isRead: isRead !== undefined ? isRead : libraryData.userBookStates[stateIndex].isRead,
        isInReadingList: isInReadingList !== undefined ? isInReadingList : libraryData.userBookStates[stateIndex].isInReadingList,
        readAt: isRead ? (libraryData.userBookStates[stateIndex].readAt || new Date().toISOString()) : undefined,
        addedToListAt: isInReadingList ? (libraryData.userBookStates[stateIndex].addedToListAt || new Date().toISOString()) : undefined
      };
    }
    await saveLibraryData(drive, libraryData);
    return NextResponse.json(libraryData.userBookStates.find((s) => s.userId === session.user!.id && s.bookId === bookId));
  } catch (error) {
    console.error('Error updating user book state:', error);
    return NextResponse.json(
      { error: 'Failed to update user book state' },
      { status: 500 }
    );
  }
}
