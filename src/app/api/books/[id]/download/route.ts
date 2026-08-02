import { NextRequest, NextResponse } from 'next/server';
import { LibraryData } from '@/app/types/book';
import { getGoogleDriveClient, getLibraryMetadata, getFileWebViewLink } from '@/lib/googleDrive';
import { auth } from '../../../auth/[...nextauth]/route';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

async function getLibraryData(drive: any): Promise<LibraryData> {
  try {
    const data = await getLibraryMetadata(drive, GOOGLE_DRIVE_FOLDER_ID);
    return {
      books: data.books || [], notes: data.notes || [], userBookStates: data.userBookStates || [],
      collections: data.collections || [], booksToAcquire: data.booksToAcquire || []
    };
  } catch (error) {
    console.error('Error fetching library data:', error);
    return { books: [], notes: [], userBookStates: [], collections: [], booksToAcquire: [] };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(false); // Use service account

    const { id } = await params;
    const libraryData = await getLibraryData(drive);
    const book = libraryData.books.find((b) => b.id === id);

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    if (!book.filePath || book.fileType === 'physical') {
      return NextResponse.json(
        { error: 'Digital file not available for this book' },
        { status: 400 }
      );
    }

    const fileInfo = await getFileWebViewLink(drive, book.filePath);

    return NextResponse.json({ downloadUrl: fileInfo.webViewLink || fileInfo.webContentLink });
  } catch (error) {
    console.error('Error generating download URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}
