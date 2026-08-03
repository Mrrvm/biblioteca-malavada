import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveClient } from '@/lib/googleDrive';
import { auth } from '../../auth/[...nextauth]/route';

export async function GET(request: NextRequest) {
    const fileId = request.nextUrl.searchParams.get('fileId');
    if (!fileId) {
        return new NextResponse('Missing fileId', { status: 400 });
    }

    try {
        const session = await auth();
        let drive;

        // Try to use the user's own Drive client first (if logged in)
        if (session) {
            try {
                drive = await getGoogleDriveClient(true);
            } catch (e) {
                // Fallback to service account if user auth fails
                console.warn('User Drive client failed, falling back to service account', e);
                drive = await getGoogleDriveClient(false);
            }
        } else {
            // Not logged in – use service account (folder must be shared with it)
            drive = await getGoogleDriveClient(false);
        }

        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );
        // response.data is an ArrayBuffer; cast it to avoid TypeScript errors
        const buffer = Buffer.from(response.data as ArrayBuffer);
        const contentType = response.headers['content-type'] || 'image/jpeg';
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (error) {
        console.error('Failed to fetch cover image:', error);
        return new NextResponse('Image not found', { status: 404 });
    }
}