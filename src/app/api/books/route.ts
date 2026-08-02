import { NextRequest, NextResponse } from 'next/server';
import { BookMetadata, LibraryData } from '@/app/types/book';
import {
  getGoogleDriveClient,
  getLibraryMetadata,
  saveLibraryMetadata,
  uploadFileToDrive,
  normalizeLibraryData,
  extractPdfCoverAsBase64,
  extractEpubCoverAsBase64
} from '@/lib/googleDrive';
import { searchCoverImage } from '../utils/coverImage';
import { auth } from '../auth/[...nextauth]/route';

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

async function getLibraryData(drive: any): Promise<LibraryData> {
  try {
    console.log('Calling getLibraryMetadata...');
    const data = await getLibraryMetadata(drive, GOOGLE_DRIVE_FOLDER_ID);
    console.log('getLibraryMetadata returned:', data);
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
    const userDrive = await getGoogleDriveClient(true);
    const serviceDrive = await getGoogleDriveClient(false);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const metadata = JSON.parse(formData.get('metadata') as string);
    const customCoverFile = formData.get('customCover') as File | null;

    const id = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const bookMetadata: BookMetadata = {
      ...metadata,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (customCoverFile && customCoverFile.size > 0) {
      try {
        console.log('Using custom cover image uploaded by user:', customCoverFile.name);
        const coverBuffer = Buffer.from(await customCoverFile.arrayBuffer());
        const uploadedCover = await uploadFileToDrive(
          userDrive,
          GOOGLE_DRIVE_FOLDER_ID,
          `${id}-cover.${customCoverFile.type.includes('png') ? 'png' : 'jpg'}`,
          customCoverFile.type,
          coverBuffer
        );
        const base64Cover = coverBuffer.toString('base64');
        bookMetadata.coverImage = `data:${customCoverFile.type};base64,${base64Cover}`;
        console.log('Custom cover image applied successfully (file saved to drive id:', uploadedCover.id, ')');
      } catch (customCoverErr) {
        console.warn('Failed to process custom cover, will try other methods:', customCoverErr);
      }
    }

    if (!bookMetadata.coverImage && bookMetadata.fileType !== 'physical' && file) {
      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        if (bookMetadata.fileType === 'pdf') {
          const pdfCover = await extractPdfCoverAsBase64(fileBuffer);
          if (pdfCover) {
            bookMetadata.coverImage = pdfCover;
            console.log('Applied PDF first page as cover');
          }
        } else if (bookMetadata.fileType === 'epub') {
          const epubCover = await extractEpubCoverAsBase64(fileBuffer);
          if (epubCover) {
            bookMetadata.coverImage = epubCover;
            console.log('Applied EPUB cover as cover');
          }
        }
      } catch (extractCoverErr) {
        console.warn('Failed to extract cover from file:', extractCoverErr);
      }
    }

    if (!bookMetadata.coverImage) {
      try {
        bookMetadata.coverImage = await searchCoverImage(bookMetadata);
      } catch (coverError) {
        console.warn('Error searching cover image online during upload:', coverError);
        bookMetadata.coverImage = '';
      }
    }

    const libraryData = await getLibraryData(serviceDrive);
    libraryData.books.push(bookMetadata);

    if (bookMetadata.fileType !== 'physical' && file) {
      console.log('Uploading file to Google Drive (using user OAuth):', file.name);
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const uploadedFile = await uploadFileToDrive(userDrive, GOOGLE_DRIVE_FOLDER_ID, `${id}-${file.name}`, file.type, fileBuffer);
      bookMetadata.filePath = uploadedFile.id;
    }
    await saveLibraryData(userDrive, libraryData);
    return NextResponse.json(bookMetadata);
  } catch (error) {
    console.error('Error uploading book:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload book',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
