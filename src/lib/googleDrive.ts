import { google } from 'googleapis';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { JWT } from 'google-auth-library';
import { BookMetadata } from '@/app/types/book';
import { extractMetadataFromFilename, searchBookMetadataOnline } from './metadataExtractor';
import { searchCoverImage } from '@/app/api/utils/coverImage';

let serviceAccountClient: JWT | null = null;

function getServiceAccountClient() {
  if (serviceAccountClient) return serviceAccountClient;

  let credentials;
  const keyConfig = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
  try {
    // Try parsing as JSON string first
    credentials = JSON.parse(keyConfig);
  } catch (e) {
    // If that fails, assume it's a file path
    const fs = require('fs');
    const path = require('path');
    const keyPath = path.resolve(process.cwd(), keyConfig);
    credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  }

  serviceAccountClient = new google.auth.JWT(
    credentials.client_email,
    undefined,
    credentials.private_key,
    ['https://www.googleapis.com/auth/drive'],
    undefined
  );

  return serviceAccountClient;
}

export async function getGoogleDriveClient(forUser: boolean = false) {
  if (forUser) {
    const session = await auth();
    if (!session?.accessToken) {
      throw new Error('Not authenticated');
    }

    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({
      access_token: session.accessToken,
    });

    return google.drive({ version: 'v3', auth: authClient });
  } else {
    const authClient = getServiceAccountClient();
    return google.drive({ version: 'v3', auth: authClient });
  }
}

export async function findOrCreateFolder(drive: any, folderId: string) {
  // Verify folder exists
  try {
    const folder = await drive.files.get({
      fileId: folderId,
      fields: 'id, name',
    });
    return folder.data.id;
  } catch (error) {
    throw new Error('Failed to access Google Drive folder');
  }
}

async function scanFolderForBooks(drive: any, folderId: string): Promise<BookMetadata[]> {
  // List all PDF and EPUB files in the folder
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType = 'application/pdf' or mimeType = 'application/epub+zip' or name contains '.pdf' or name contains '.epub') and trashed = false`,
    fields: 'files(id, name)',
  });

  const books: BookMetadata[] = [];

  if (res.data.files) {
    for (const file of res.data.files) {
      const filename = file.name;
      let fileType: 'pdf' | 'epub' = 'pdf';
      if (filename.endsWith('.epub') || file.mimeType === 'application/epub+zip') {
        fileType = 'epub';
      } else {
        fileType = 'pdf';
      }

      const filenameMetadata = extractMetadataFromFilename(filename);
      let onlineMetadata;
      if (filenameMetadata.title || filenameMetadata.isbn) {
        onlineMetadata = await searchBookMetadataOnline(
          filenameMetadata.title || filename,
          filenameMetadata.isbn
        );
      }

      const id = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      const book: BookMetadata = {
        id,
        title: filenameMetadata.title || onlineMetadata?.title || filename.replace(/\.(pdf|epub)$/i, ''),
        author: filenameMetadata.author || onlineMetadata?.author || '',
        authors: onlineMetadata?.authors,
        date: filenameMetadata.publicationDate || onlineMetadata?.publicationDate,
        publicationDate: filenameMetadata.publicationDate || onlineMetadata?.publicationDate,
        genres: onlineMetadata?.genres,
        isbn: filenameMetadata.isbn || onlineMetadata?.isbn,
        description: onlineMetadata?.description,
        publisher: onlineMetadata?.publisher,
        language: onlineMetadata?.language,
        pages: onlineMetadata?.pages,
        coverImage: '',
        filePath: file.id,
        fileType,
        collections: [],
        createdAt: now,
        updatedAt: now,
      };

      book.coverImage = await searchCoverImage(book);
      books.push(book);
    }
  }

  return books;
}

export async function getLibraryMetadata(drive: any, folderId: string) {
  console.log('getLibraryMetadata called for folder:', folderId);
  // List all files in folder for debugging
  const allFilesRes = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
  });
  console.log('All files in Google Drive folder:', allFilesRes.data);

  // Search for metadata file in the folder
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name = 'biblioteca-malavada-metadata.json' and trashed = false`,
    fields: 'files(id, name)',
  });
  console.log('Google Drive files.list response for metadata.json:', res.data);

  if (res.data.files && res.data.files.length > 0) {
    const fileId = res.data.files[0].id;
    console.log('Found metadata file, id:', fileId);
    const fileRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'json' }
    );
    console.log('Metadata file content:', fileRes.data);
    return fileRes.data;
  } else {
    console.log('No metadata file found, scanning for books...');
    // No metadata file found - scan for existing books and create metadata
    const books = await scanFolderForBooks(drive, folderId);
    console.log('Found books:', books);
    const libraryData = {
      books,
      notes: [],
      userBookStates: [],
    };

    // Save the newly created metadata file to Google Drive
    console.log('Saving new library data:', libraryData);
    await saveLibraryMetadata(drive, folderId, libraryData);
    return libraryData;
  }
}

export async function saveLibraryMetadata(drive: any, folderId: string, data: any) {
  // Search for existing metadata file
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name = 'biblioteca-malavada-metadata.json' and trashed = false`,
    fields: 'files(id, name)',
  });

  const media = {
    mimeType: 'application/json',
    body: JSON.stringify(data, null, 2),
  };

  if (res.data.files && res.data.files.length > 0) {
    // Update existing file
    const fileId = res.data.files[0].id;
    await drive.files.update({
      fileId: fileId,
      media: media,
    });
  } else {
    // Create new file
    const fileMetadata = {
      name: 'biblioteca-malavada-metadata.json',
      parents: [folderId],
    };
    await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });
  }
}

export async function uploadFileToDrive(drive: any, folderId: string, filename: string, mimeType: string, buffer: Buffer) {
  const fileMetadata = {
    name: filename,
    parents: [folderId],
  };

  const media = {
    mimeType: mimeType,
    body: buffer,
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, webViewLink, webContentLink',
  });

  return file.data;
}

export async function getFileFromDrive(drive: any, fileId: string) {
  const file = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(file.data);
}

export async function getFileWebViewLink(drive: any, fileId: string) {
  const file = await drive.files.get({
    fileId: fileId,
    fields: 'webViewLink, webContentLink',
  });
  return file.data;
}
