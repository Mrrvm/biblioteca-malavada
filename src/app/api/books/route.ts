import { NextRequest, NextResponse } from 'next/server';
import { BookMetadata, LibraryData } from '@/app/types/book';
import { getGoogleDriveClient, getLibraryMetadata, saveLibraryMetadata, uploadFileToDrive } from '@/lib/googleDrive';
import { searchCoverImage } from '../utils/coverImage';
import { auth } from '../auth/[...nextauth]/route';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

async function getLibraryData(drive: any): Promise<LibraryData> {
  try {
    console.log('Calling getLibraryMetadata...');
    const data = await getLibraryMetadata(drive, GOOGLE_DRIVE_FOLDER_ID);
    console.log('getLibraryMetadata returned:', data);
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

export async function GET() {
  try {
    const drive = await getGoogleDriveClient(false);
    const libraryData = await getLibraryData(drive);
    return NextResponse.json(libraryData);
  } catch (error) {
    console.error('Error fetching books:', error);
    return NextResponse.json(
      { error: 'Failed to fetch books' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    // Use service account client for all drive operations
    const drive = await getGoogleDriveClient(false);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const metadata = JSON.parse(formData.get('metadata') as string);

    const id = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const bookMetadata: BookMetadata = {
      ...metadata,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    bookMetadata.coverImage = await searchCoverImage(bookMetadata);
    const libraryData = await getLibraryData(drive);
    libraryData.books.push(bookMetadata);

    if (bookMetadata.fileType !== 'physical' && file) {
      console.log('Uploading file to Google Drive:', file.name);
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const uploadedFile = await uploadFileToDrive(drive, GOOGLE_DRIVE_FOLDER_ID, `${id}-${file.name}`, file.type, fileBuffer);
      bookMetadata.filePath = uploadedFile.id;
    }
    await saveLibraryData(drive, libraryData);
    return NextResponse.json(bookMetadata);
  } catch (error) {
    console.error('Error uploading book:', error);
    return NextResponse.json(
      { error: 'Failed to upload book' },
      { status: 500 }
    );
  }
}
