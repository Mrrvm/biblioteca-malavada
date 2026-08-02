import { google } from 'googleapis';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { JWT, OAuth2Client } from 'google-auth-library';
import { BookMetadata, LibraryData } from '@/app/types/book';
import { extractMetadataFromFilename, searchBookMetadataOnline } from './metadataExtractor';
import { searchCoverImage } from '@/app/api/utils/coverImage';
import { Readable } from 'stream';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

let serviceAccountClient: JWT | null = null;

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {
    console.log('refreshAccessToken: Attempting to refresh access token...');
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
    console.log('refreshAccessToken: Success! New token expires at', new Date(expiresAt).toISOString());
    return { accessToken: newAccessToken, expiresAt };
  } catch (err) {
    console.error('refreshAccessToken: ERROR during refresh:', err);
    return null;
  }
}

export async function extractPdfCoverAsBase64(pdfBuffer: Buffer): Promise<string | null> {
  try {
    console.log('extractPdfCoverAsBase64: Extracting first page as cover...');

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
        console.log('extractPdfCoverAsBase64: pdf2pic succeeded');
        return `data:image/png;base64,${pageToImage.base64}`;
      }
    } catch (pdf2picErr) {
      console.warn('extractPdfCoverAsBase64: pdf2pic failed (GraphicsMagick not installed?):', (pdf2picErr as Error).message);
    }

    try {
      console.log('extractPdfCoverAsBase64: Trying pdfjs-dist + jimp pure-JS rendering...');
      let pdfjsLib: any;
      try {
        pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
      } catch (_) {
        try {
          pdfjsLib = require('pdfjs-dist/build/pdf.js');
        } catch (__) {
          pdfjsLib = require('pdfjs-dist');
        }
      }
      const jimp = require('jimp');

      if (pdfjsLib?.GlobalWorkerOptions) {
        try {
          let workerSrc: string | undefined;
          try { workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.js'); } catch (_) {
            try { workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.min.js'); } catch (__) { }
          }
          if (workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        } catch (_w) { }
      }

      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        useSystemFonts: true,
        isEvalSupported: false,
        disableWorker: true,
      }).promise;

      const page = await pdf.getPage(1);
      const scale = 1.3;
      const viewport = page.getViewport({ scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);

      const rgba = new Uint8ClampedArray(width * height * 4);
      rgba.fill(255);

      const renderContext = {
        canvasContext: createMinimal2DContext(width, height, rgba),
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      const image = await jimp.create(width, height);
      image.bitmap.data = Buffer.from(rgba);
      const pngBase64 = await image.getBase64Async(jimp.MIME_PNG);

      if (pngBase64 && pngBase64.startsWith('data:image')) {
        console.log('extractPdfCoverAsBase64: pdfjs-dist + jimp rendering succeeded (length=', pngBase64.length, ')');
        return pngBase64;
      }
    } catch (pdfjsErr: any) {
      console.warn('extractPdfCoverAsBase64: pdfjs-dist fallback failed:', pdfjsErr?.stack || pdfjsErr?.message || String(pdfjsErr));
    }

    console.log('extractPdfCoverAsBase64: No suitable cover extracted');
    return null;
  } catch (error) {
    console.error('extractPdfCoverAsBase64: error:', error);
    return null;
  }
}

function createMinimal2DContext(width: number, height: number, rgba: Uint8ClampedArray): any {
  const data = rgba;
  let fillStyle = '#000000';
  let strokeStyle = '#000000';
  let globalAlpha = 1;
  let font = '10px sans-serif';
  let lineWidth = 1;
  let textAlign: CanvasTextAlign = 'start';
  let textBaseline: CanvasTextBaseline = 'alphabetic';

  function parseColor(color: string): [number, number, number, number] {
    if (color.startsWith('#')) {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b, 255];
    }
    if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(',').map(s => s.trim());
        return [
          parseInt(parts[0]),
          parseInt(parts[1]),
          parseInt(parts[2]),
          parts[3] ? Math.round(parseFloat(parts[3]) * 255) : 255,
        ];
      }
    }
    return [0, 0, 0, 255];
  }

  function setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const ia = a / 255 * globalAlpha;
    if (ia >= 0.999) {
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    } else {
      const oa = data[i + 3] / 255;
      const outA = ia + oa * (1 - ia);
      if (outA === 0) return;
      data[i] = Math.round((r * ia + data[i] * oa * (1 - ia)) / outA);
      data[i + 1] = Math.round((g * ia + data[i + 1] * oa * (1 - ia)) / outA);
      data[i + 2] = Math.round((b * ia + data[i + 2] * oa * (1 - ia)) / outA);
      data[i + 3] = Math.round(outA * 255);
    }
  }

  function fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = parseColor(fillStyle);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        setPixel(xx, yy, r, g, b, a);
      }
    }
  }

  function clearRect(x: number, y: number, w: number, h: number) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * width + xx) * 4;
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
      }
    }
  }

  function strokeRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = parseColor(strokeStyle);
    const lw = Math.max(1, Math.round(lineWidth));
    for (let k = 0; k < lw; k++) {
      const xi = Math.floor(x) + k;
      const xf = Math.floor(x + w) - 1 - k;
      const yi = Math.floor(y) + k;
      const yf = Math.floor(y + h) - 1 - k;
      if (xi >= xf || yi >= yf) break;
      for (let xx = xi; xx <= xf; xx++) {
        setPixel(xx, yi, r, g, b, a);
        setPixel(xx, yf, r, g, b, a);
      }
      for (let yy = yi + 1; yy < yf; yy++) {
        setPixel(xi, yy, r, g, b, a);
        setPixel(xf, yy, r, g, b, a);
      }
    }
  }

  function drawImage(img: any, a: number, b: number, c?: number, d?: number, e?: number, f?: number, g?: number, h?: number) {
    let srcX = 0, srcY = 0, srcW = 0, srcH = 0;
    let dstX = 0, dstY = 0, dstW = 0, dstH = 0;
    const argsCount = [a, b, c, d, e, f, g, h].filter(x => x !== undefined).length + 1;
    const imgW = img?.width || 0;
    const imgH = img?.height || 0;

    if (argsCount <= 3) {
      srcW = imgW; srcH = imgH;
      dstX = a; dstY = b; dstW = imgW; dstH = imgH;
    } else if (argsCount === 5) {
      srcW = imgW; srcH = imgH;
      dstX = a; dstY = b; dstW = c!; dstH = d!;
    } else {
      srcX = a; srcY = b; srcW = c!; srcH = d!;
      dstX = e!; dstY = f!; dstW = g!; dstH = h!;
    }

    const imgData = img?.data || img?.bitmap?.data;
    if (!imgData) return;
    if (dstW <= 0 || dstH <= 0 || srcW <= 0 || srcH <= 0 || imgW <= 0 || imgH <= 0) return;

    for (let yy = 0; yy < dstH; yy++) {
      for (let xx = 0; xx < dstW; xx++) {
        const sxx = srcX + Math.min(srcW - 1, Math.floor((xx / dstW) * srcW));
        const syy = srcY + Math.min(srcH - 1, Math.floor((yy / dstH) * srcH));
        if (sxx < 0 || syy < 0 || sxx >= imgW || syy >= imgH) continue;
        const si = (syy * imgW + sxx) * 4;
        setPixel(Math.floor(dstX + xx), Math.floor(dstY + yy), imgData[si], imgData[si + 1], imgData[si + 2], imgData[si + 3]);
      }
    }
  }

  function createImageData(w: number, h: number) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  function putImageData(imgData: any, x: number, y: number) {
    const { width: iw, height: ih, data: id } = imgData;
    for (let yy = 0; yy < ih; yy++) {
      for (let xx = 0; xx < iw; xx++) {
        const si = (yy * iw + xx) * 4;
        setPixel(Math.floor(x + xx), Math.floor(y + yy), id[si], id[si + 1], id[si + 2], id[si + 3]);
      }
    }
  }

  function getImageData(x: number, y: number, w: number, h: number) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const sx = Math.floor(x + xx);
        const sy = Math.floor(y + yy);
        const si = (sy * width + sx) * 4;
        const di = (yy * w + xx) * 4;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
          out[di] = 0; out[di + 1] = 0; out[di + 2] = 0; out[di + 3] = 0;
        } else {
          out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
        }
      }
    }
    return { width: w, height: h, data: out };
  }

  function save() { }
  function restore() { }
  function scale() { }
  function rotate() { }
  function translate() { }
  function transform() { }
  function setTransform() { }
  function beginPath() { }
  function moveTo() { }
  function lineTo() { }
  function bezierCurveTo() { }
  function quadraticCurveTo() { }
  function closePath() { }
  function fill() { }
  function stroke() { }
  function clip() { }
  function rect() { }
  function arc() { }
  function fillText() { }
  function strokeText() { }
  function measureText(text: string) { return { width: String(text).length * 8 }; }

  return {
    canvas: { width, height },
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; },
    get globalAlpha() { return globalAlpha; },
    set globalAlpha(v: number) { globalAlpha = v; },
    get font() { return font; },
    set font(v: string) { font = v; },
    get lineWidth() { return lineWidth; },
    set lineWidth(v: number) { lineWidth = v; },
    get textAlign() { return textAlign; },
    set textAlign(v: CanvasTextAlign) { textAlign = v; },
    get textBaseline() { return textBaseline; },
    set textBaseline(v: CanvasTextBaseline) { textBaseline = v; },
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    miterLimit: 10,
    fillRect,
    strokeRect,
    clearRect,
    drawImage,
    createImageData,
    putImageData,
    getImageData,
    save,
    restore,
    scale,
    rotate,
    translate,
    transform,
    setTransform,
    beginPath,
    moveTo,
    lineTo,
    bezierCurveTo,
    quadraticCurveTo,
    closePath,
    fill,
    stroke,
    clip,
    rect,
    arc,
    fillText,
    strokeText,
    measureText,
  };
}

export async function extractEpubCoverAsBase64(epubBuffer: Buffer): Promise<string | null> {
  try {
    console.log('extractEpubCoverAsBase64: Extracting cover from EPUB...');
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
        console.log('extractEpubCoverAsBase64: Found cover at', path);
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

    console.log('extractEpubCoverAsBase64: No cover found in EPUB');
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
    // Ensure the client is authorized before returning
    try {
      await serviceAccountClient.authorize();
    } catch (authErr) {
      console.error('getServiceAccountClient: Failed to authorize cached client:', authErr);
      serviceAccountClient = null; // Reset cache to retry fresh
    }
  }

  if (!serviceAccountClient) {
    let credentials;
    const keyConfig = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
    console.log('getServiceAccountClient: Loading credentials from env var, length:', keyConfig.length);
    try {
      // Try parsing as JSON string first
      try {
        credentials = JSON.parse(keyConfig);
        console.log('getServiceAccountClient: Parsed credentials from JSON string');
      } catch (e) {
        // If that fails, assume it's a file path
        const fs = require('fs');
        const path = require('path');
        const keyPath = path.resolve(process.cwd(), keyConfig);
        console.log('getServiceAccountClient: JSON parse failed, reading key file at path:', keyPath);
        credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        console.log('getServiceAccountClient: Loaded credentials from file');
      }

      console.log('getServiceAccountClient: Credentials client_email present?', !!credentials.client_email);
      console.log('getServiceAccountClient: Credentials private_key present?', !!credentials.private_key);

      // Use google.auth.fromJSON which is the recommended way to create from JSON credentials
      // Also ensure private_key has proper newlines (some env vars strip them)
      const normalizedCredentials = {
        ...credentials,
        private_key: credentials.private_key?.replace(/\\n/g, '\n') || '',
      };

      let authClientFromJson = google.auth.fromJSON(normalizedCredentials) as unknown as JWT;
      // Set scopes explicitly, handling both new JWT style and createScopedRequired style
      if (typeof (authClientFromJson as any).createScoped === 'function') {
        authClientFromJson = (authClientFromJson as any).createScoped(['https://www.googleapis.com/auth/drive']);
      } else {
        (authClientFromJson as any).scopes = ['https://www.googleapis.com/auth/drive'];
      }
      serviceAccountClient = authClientFromJson;

      console.log('getServiceAccountClient: Created JWT client, authorizing...');
      const authRes = await authClientFromJson.authorize();
      console.log('getServiceAccountClient: Authorization successful, token expiry:', authRes.expiry_date);
    } catch (credErr) {
      console.error('getServiceAccountClient: ERROR loading or authorizing credentials:', credErr);
      serviceAccountClient = null; // Ensure we don't cache a broken client
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
      console.log('getGoogleDriveClient: User access token expired or expiring soon, attempting refresh...');
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
    console.log('getGoogleDriveClient: Got authenticated service account client, creating drive client');
    return google.drive({ version: 'v3', auth: authClient as any });
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
        // Skip this book and continue processing others
        continue;
      }
    }
  }

  return books;
}

export async function getLibraryMetadata(drive: any, folderId: string) {
  console.log('getLibraryMetadata called for folder:', folderId);
  try {
    // List all files in folder for debugging
    console.log('About to call drive.files.list for all files');
    const allFilesRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
    });
    console.log('All files in Google Drive folder:', allFilesRes.data);

    // Search for metadata file in the folder
    console.log('About to call drive.files.list for metadata file');
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
      console.log('Metadata file content (pre-normalization):', fileRes.data);
      const normalizedData = normalizeLibraryData(fileRes.data);
      console.log('Metadata file content (post-normalization):', normalizedData);
      return normalizedData;
    } else {
      console.log('No metadata file found, scanning for books...');
      // No metadata file found - scan for existing books and create metadata
      const books = await scanFolderForBooks(drive, folderId);
      console.log('Found books:', books);
      const libraryData = normalizeLibraryData({
        books,
      });

      // Save the newly created metadata file to Google Drive
      console.log('Saving new library data:', libraryData);
      await saveLibraryMetadata(drive, folderId, libraryData);
      return libraryData;
    }
  } catch (error) {
    console.error('Error in getLibraryMetadata:', error);
    // Return empty data on error to prevent hanging
    return normalizeLibraryData({});
  }
}

export async function saveLibraryMetadata(drive: any, folderId: string, data: any) {
  console.log('saveLibraryMetadata: saving metadata...');
  try {
    // Search for existing metadata file
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name = 'biblioteca-malavada-metadata.json' and trashed = false`,
      fields: 'files(id, name)',
    });
    console.log('saveLibraryMetadata: found existing files:', res.data);

    const jsonString = JSON.stringify(data, null, 2);
    const media = {
      mimeType: 'application/json',
      body: Readable.from(jsonString),
    };

    if (res.data.files && res.data.files.length > 0) {
      // Update existing file
      const fileId = res.data.files[0].id;
      console.log('saveLibraryMetadata: updating existing file id:', fileId);
      await drive.files.update({
        fileId: fileId,
        media: media,
      });
      console.log('saveLibraryMetadata: file updated successfully');
    } else {
      // Create new file
      const fileMetadata = {
        name: 'biblioteca-malavada-metadata.json',
        parents: [folderId],
      };
      console.log('saveLibraryMetadata: creating new metadata file');
      await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
      });
      console.log('saveLibraryMetadata: file created successfully');
    }
  } catch (err) {
    console.error('saveLibraryMetadata: ERROR:', err);
    throw err;
  }
}

export async function uploadFileToDrive(drive: any, folderId: string, filename: string, mimeType: string, buffer: Buffer) {
  console.log('uploadFileToDrive: uploading file', filename, 'with mimeType', mimeType, 'size', buffer.length);
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
    console.log('uploadFileToDrive: success, file id:', file.data.id);

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
