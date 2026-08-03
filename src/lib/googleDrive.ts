import { google } from 'googleapis';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { JWT } from 'google-auth-library';
import { BookMetadata, LibraryData } from '@/app/types/book';
import { extractMetadataFromFilename, searchBookMetadataOnline } from './metadataExtractor';
import { searchCoverImage } from '@/app/api/utils/coverImage';
import { Readable } from 'stream';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

let serviceAccountClient: JWT | null = null;

/**
 * Helper to find or create a subfolder inside a given parent folder.
 */
async function findOrCreateSubfolder(drive: any, parentId: string, name: string): Promise<string> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }
  const folder = await drive.files.create({
    resource: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return folder.data.id;
}

/**
 * Upload a cover image to the images/ subfolder of the library.
 * Returns the file ID.
 */
export async function uploadCoverImage(
  drive: any,
  folderId: string,
  bookId: string,
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  const imagesFolderId = await findOrCreateSubfolder(drive, folderId, 'images');
  const ext = mimeType.includes('png') ? 'png' : (mimeType.includes('webp') ? 'webp' : 'jpg');
  const fileName = `${bookId}-cover.${ext}`;
  const file = await uploadFileToDrive(drive, imagesFolderId, fileName, mimeType, imageBuffer);
  return file.id;
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret || !refreshToken) {
      console.warn('refreshAccessToken: Missing clientId, clientSecret, or refreshToken');
      return null;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('refreshAccessToken: Token refresh failed:', response.status, text);
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;
    return { accessToken: newAccessToken, expiresAt };
  } catch (err) {
    console.error('refreshAccessToken: ERROR during refresh:', err);
    return null;
  }
}

export async function extractPdfCoverAsBase64(pdfBuffer: Buffer): Promise<string | null> {
  try {


    // Only use pdf2pic – it's optional and will gracefully fail if not available
    try {
      const { fromBuffer } = require('pdf2pic');
      const convert = fromBuffer(pdfBuffer, {
        density: 100,
        saveFilename: 'cover',
        savePath: '/tmp',
        format: 'png',
        width: 600,
        height: 900,
      });
      const pageToImage = await convert(1, { responseType: 'base64' });
      if (pageToImage && pageToImage.base64) {

        return `data:image/png;base64,${pageToImage.base64}`;
      }
    } catch (pdf2picErr) {
      console.warn('extractPdfCoverAsBase64: pdf2pic failed (likely missing GraphicsMagick):', (pdf2picErr as Error).message);
    }


    return null;
  } catch (error) {
    console.error('extractPdfCoverAsBase64: error:', error);
    return null;
  }
}

export async function extractEpubCoverAsBase64(epubBuffer: Buffer): Promise<string | null> {
  try {

    const zip = await JSZip.loadAsync(epubBuffer);

    async function tryReadAsText(path: string): Promise<string | null> {
      const file = zip.file(path);
      return file ? await file.async('text') : null;
    }

    async function tryCoverImage(path: string): Promise<string | null> {
      const file = zip.file(path);
      if (!file) return null;
      try {
        const imageBuffer = await file.async('nodebuffer');
        const base64 = imageBuffer.toString('base64');
        const ext = path.split('.').pop()?.toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

        return `data:${mimeType};base64,${base64}`;
      } catch (e) {
        return null;
      }
    }

    const rootfileMatch = await tryReadAsText('META-INF/container.xml');
    let opfPath: string | null = null;
    if (rootfileMatch) {
      const m = rootfileMatch.match(/full-path=["']([^"']+)["']/i);
      if (m) opfPath = m[1];
    }

    if (opfPath) {
      const opfDir = opfPath.includes('/') ? opfPath.replace(/\/[^/]+$/, '/') : '';
      const opfContent = await tryReadAsText(opfPath);
      if (opfContent) {
        const coverMeta = opfContent.match(/<meta\s+name=["']cover["']\s+content=["']([^"']+)["']\s*\/?>/i);
        if (coverMeta) {
          const coverId = coverMeta[1];
          const idRegex = new RegExp(`<item[^>]+id=["']${coverId}["'][^>]*href=["']([^"']+)["'][^>]*>`, 'i');
          const itemMatch = opfContent.match(idRegex);
          if (itemMatch) {
            const href = itemMatch[1];
            const fullPath = opfDir + href;
            const result = await tryCoverImage(fullPath);
            if (result) return result;
          }
        }

        const manifestRegex = /<item[^>]+href=["']([^"']*\.(?:jpg|jpeg|png|webp))["'][^>]*>/gi;
        let mm: RegExpExecArray | null;
        const candidatesFromManifest: string[] = [];
        while ((mm = manifestRegex.exec(opfContent)) !== null) {
          const p = opfDir + mm[1];
          if (p.toLowerCase().includes('cover')) candidatesFromManifest.unshift(p);
          else candidatesFromManifest.push(p);
        }
        for (const p of candidatesFromManifest) {
          const result = await tryCoverImage(p);
          if (result) return result;
        }
      }
    }

    const coverCandidates = [
      'cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp',
      'OEBPS/cover.jpg', 'OEBPS/cover.jpeg', 'OEBPS/cover.png', 'OEBPS/cover.webp',
      'OEBPS/images/cover.jpg', 'OEBPS/images/cover.jpeg', 'OEBPS/images/cover.png', 'OEBPS/images/cover.webp',
    ];

    for (const candidate of coverCandidates) {
      const result = await tryCoverImage(candidate);
      if (result) return result;
    }

    const allFiles = Object.keys(zip.files);
    const imageFiles = allFiles.filter(name =>
      /\.(jpg|jpeg|png|webp)$/i.test(name));
    const coverFile = imageFiles.find(name => name.toLowerCase().includes('cover'));

    if (coverFile) {
      const result = await tryCoverImage(coverFile);
      if (result) return result;
    }

    if (imageFiles.length > 0) {
      try {
        const candidatesWithSize = await Promise.all(
          imageFiles.map(async (p) => {
            const f = zip.file(p);
            let size = 0;
            try { if (f) { const buf = await f.async('nodebuffer'); size = buf.length; } } catch (_) { /* ignore */ }
            return { p, size };
          })
        );
        const largestImage = candidatesWithSize
          .filter(c => c.size > 5000)
          .sort((a, b) => b.size - a.size)[0];
        if (largestImage) {
          const result = await tryCoverImage(largestImage.p);
          if (result) return result;
        }
      } catch (sizeErr) {
        console.warn('extractEpubCoverAsBase64: failed to rank images by size, trying first candidate');
        const first = imageFiles[0];
        if (first) {
          const result = await tryCoverImage(first);
          if (result) return result;
        }
      }
    }


    return null;
  } catch (error) {
    console.error('extractEpubCoverAsBase64: error:', error);
    return null;
  }
}

// Migrate/initialize library data to include all new fields
export function normalizeLibraryData(data: any): LibraryData {
  return {
    books: Array.isArray(data?.books) ? data.books : [],
    notes: Array.isArray(data?.notes) ? data.notes : [],
    userBookStates: Array.isArray(data?.userBookStates) ? data.userBookStates : [],
    collections: Array.isArray(data?.collections) ? data.collections : [],
    booksToAcquire: Array.isArray(data?.booksToAcquire) ? data.booksToAcquire : [],
  };
}

async function getServiceAccountClient() {
  if (serviceAccountClient) {
    try {
      await serviceAccountClient.authorize();
    } catch (authErr) {
      console.error('getServiceAccountClient: Failed to authorize cached client:', authErr);
      serviceAccountClient = null;
    }
  }

  if (!serviceAccountClient) {
    let credentials;
    const keyConfig = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';

    try {
      try {
        credentials = JSON.parse(keyConfig);

      } catch (e) {
        const fs = require('fs');
        const path = require('path');
        const keyPath = path.resolve(process.cwd(), keyConfig);

        credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

      }




      const normalizedCredentials = {
        ...credentials,
        private_key: credentials.private_key?.replace(/\\n/g, '\n') || '',
      };

      let authClientFromJson = google.auth.fromJSON(normalizedCredentials) as unknown as JWT;
      if (typeof (authClientFromJson as any).createScoped === 'function') {
        authClientFromJson = (authClientFromJson as any).createScoped(['https://www.googleapis.com/auth/drive']);
      } else {
        (authClientFromJson as any).scopes = ['https://www.googleapis.com/auth/drive'];
      }
      serviceAccountClient = authClientFromJson;


      const authRes = await authClientFromJson.authorize();

    } catch (credErr) {
      console.error('getServiceAccountClient: ERROR loading or authorizing credentials:', credErr);
      serviceAccountClient = null;
      throw credErr;
    }
  }

  return serviceAccountClient;
}

export async function getGoogleDriveClient(forUser: boolean = false) {
  if (forUser) {
    const session = await auth();
    if (!session?.accessToken) {
      throw new Error('Not authenticated');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const authClient = new google.auth.OAuth2(clientId, clientSecret);

    let accessToken = session.accessToken;
    const refreshToken = session.refreshToken;
    const expiresAt = session.expiresAt || 0;

    const TOKEN_BUFFER_MS = 5 * 60 * 1000;
    const isExpired = !expiresAt || Date.now() >= (expiresAt - TOKEN_BUFFER_MS);

    if (isExpired && refreshToken) {

      const refreshed = await refreshAccessToken(refreshToken);
      if (refreshed) {
        accessToken = refreshed.accessToken;
      } else {
        console.warn('getGoogleDriveClient: Token refresh failed, attempting to use existing token anyway');
      }
    } else if (isExpired) {
      console.warn('getGoogleDriveClient: Token expired but no refreshToken available; user may need to re-authenticate');
    }

    authClient.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return google.drive({ version: 'v3', auth: authClient as any });
  } else {
    const authClient = await getServiceAccountClient();

    return google.drive({ version: 'v3', auth: authClient as any });
  }
}

export async function findOrCreateFolder(drive: any, folderId: string) {
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
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType = 'application/pdf' or mimeType = 'application/epub+zip' or name contains '.pdf' or name contains '.epub') and trashed = false`,
    fields: 'files(id, name)',
  });

  const books: BookMetadata[] = [];

  if (res.data.files) {
    for (const file of res.data.files) {
      try {
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
          try {
            onlineMetadata = await searchBookMetadataOnline(
              filenameMetadata.title || filename,
              filenameMetadata.isbn
            );
          } catch (err) {
            console.warn('Error searching online metadata for file', filename, err);
            onlineMetadata = null;
          }
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

        try {
          book.coverImage = await searchCoverImage(book);
        } catch (err) {
          console.warn('Error searching cover image for file', filename, err);
          book.coverImage = '';
        }
        books.push(book);
      } catch (err) {
        console.error('Error processing file', file.name, err);
        continue;
      }
    }
  }

  return books;
}

export async function getLibraryMetadata(drive: any, folderId: string) {

  try {

    const allFilesRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
    });



    const res = await drive.files.list({
      q: `'${folderId}' in parents and name = 'biblioteca-malavada-metadata.json' and trashed = false`,
      fields: 'files(id, name)',
    });


    if (res.data.files && res.data.files.length > 0) {
      const fileId = res.data.files[0].id;

      const fileRes = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'json' }
      );
      const normalizedData = normalizeLibraryData(fileRes.data);
      return normalizedData;
    } else {

      const books = await scanFolderForBooks(drive, folderId);

      const libraryData = normalizeLibraryData({
        books,
      });


      await saveLibraryMetadata(drive, folderId, libraryData);
      return libraryData;
    }
  } catch (error) {
    console.error('Error in getLibraryMetadata:', error);
    return normalizeLibraryData({});
  }
}

export async function saveLibraryMetadata(drive: any, folderId: string, data: any) {

  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name = 'biblioteca-malavada-metadata.json' and trashed = false`,
      fields: 'files(id, name)',
    });


    const jsonString = JSON.stringify(data, null, 2);
    const media = {
      mimeType: 'application/json',
      body: Readable.from(jsonString),
    };

    if (res.data.files && res.data.files.length > 0) {
      const fileId = res.data.files[0].id;

      await drive.files.update({
        fileId: fileId,
        media: media,
      });

    } else {
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
  } catch (err) {
    console.error('saveLibraryMetadata: ERROR:', err);
    throw err;
  }
}

export async function uploadFileToDrive(drive: any, folderId: string, filename: string, mimeType: string, buffer: Buffer) {

  try {
    const fileMetadata = {
      name: filename,
      parents: [folderId],
    };

    const media = {
      mimeType: mimeType,
      body: Readable.from(buffer),
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });


    return file.data;
  } catch (err) {
    console.error('uploadFileToDrive: ERROR:', err);
    throw err;
  }
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