import { NextRequest, NextResponse } from 'next/server';
import { BookMetadata, LibraryData } from '@/app/types/book';
import {
  getGoogleDriveClient,
  getLibraryMetadata,
  saveLibraryMetadata,
  uploadFileToDrive,
  normalizeLibraryData,
  extractPdfCoverAsBase64,
  extractEpubCoverAsBase64,
  uploadCoverImage,
} from '@/lib/googleDrive';
import { searchCoverImage } from '../utils/coverImage';
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

    // --- Handle cover image ---
    let coverFileId: string | undefined;

    if (customCoverFile && customCoverFile.size > 0) {
      try {
        const coverBuffer = Buffer.from(await customCoverFile.arrayBuffer());
        coverFileId = await uploadCoverImage(userDrive, GOOGLE_DRIVE_FOLDER_ID, id, coverBuffer, customCoverFile.type);
      } catch (customCoverErr) {
        console.warn('Failed to upload custom cover:', customCoverErr);
      }
    }

    // If no custom cover and we have a digital file, try to extract cover from file
    if (!coverFileId && file && bookMetadata.fileType !== 'physical') {
      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        let coverBuffer: Buffer | null = null;
        let mimeType = 'image/jpeg';
        if (bookMetadata.fileType === 'pdf') {
          const base64 = await extractPdfCoverAsBase64(fileBuffer);
          if (base64) {
            const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches) {
              mimeType = matches[1];
              coverBuffer = Buffer.from(matches[2], 'base64');
            }
          }
        } else if (bookMetadata.fileType === 'epub') {
          const base64 = await extractEpubCoverAsBase64(fileBuffer);
          if (base64) {
            const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches) {
              mimeType = matches[1];
              coverBuffer = Buffer.from(matches[2], 'base64');
            }
          }
        }
        if (coverBuffer) {
          coverFileId = await uploadCoverImage(userDrive, GOOGLE_DRIVE_FOLDER_ID, id, coverBuffer, mimeType);

        }
      } catch (extractErr) {
        console.warn('Failed to extract/upload cover from file:', extractErr);
      }
    }

    // If still no cover, try online search and upload if a URL is found
    if (!coverFileId) {
      try {
        const onlineCoverUrl = await searchCoverImage(bookMetadata);
        if (onlineCoverUrl) {
          // Download the image and upload to Drive
          const response = await fetch(onlineCoverUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const coverBuffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            coverFileId = await uploadCoverImage(userDrive, GOOGLE_DRIVE_FOLDER_ID, id, coverBuffer, contentType);

          }
        }
      } catch (coverError) {
        console.warn('Error fetching/uploading online cover:', coverError);
      }
    }

    if (coverFileId) {
      bookMetadata.coverFileId = coverFileId;
    }

    // --- Upload the book file if digital ---
    const libraryData = await getLibraryData(serviceDrive);
    libraryData.books.push(bookMetadata);

    if (bookMetadata.fileType !== 'physical' && file) {

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