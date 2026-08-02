import { NextRequest, NextResponse } from 'next/server';
import { LibraryData, LibraryCollection } from '@/app/types/book';
import { 
  getGoogleDriveClient, 
  getLibraryMetadata, 
  saveLibraryMetadata, 
  normalizeLibraryData 
} from '@/lib/googleDrive';
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
    return NextResponse.json(libraryData.collections);
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(true);

    const { name, description } = await request.json();
    if (!name) {
      return NextResponse.json(
        { error: 'Collection name is required' },
        { status: 400 }
      );
    }

    const id = `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newCollection: LibraryCollection = {
      id,
      name,
      description,
      createdByUserId: session.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const libraryData = await getLibraryData(drive);
    libraryData.collections.push(newCollection);
    await saveLibraryData(drive, libraryData);
    return NextResponse.json(newCollection);
  } catch (error) {
    console.error('Error creating collection:', error);
    return NextResponse.json(
      { error: 'Failed to create collection' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const drive = await getGoogleDriveClient(true);

    const { id, name, description } = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: 'Collection ID is required' },
        { status: 400 }
      );
    }

    const libraryData = await getLibraryData(drive);
    const collectionIndex = libraryData.collections.findIndex(c => c.id === id);
    if (collectionIndex === -1) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    libraryData.collections[collectionIndex] = {
      ...libraryData.collections[collectionIndex],
      name: name ?? libraryData.collections[collectionIndex].name,
      description: description !== undefined ? description : libraryData.collections[collectionIndex].description,
      updatedAt: new Date().toISOString(),
    };
    await saveLibraryData(drive, libraryData);
    return NextResponse.json(libraryData.collections[collectionIndex]);
  } catch (error) {
    console.error('Error updating collection:', error);
    return NextResponse.json(
      { error: 'Failed to update collection' },
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
    if (!id) {
      return NextResponse.json(
        { error: 'Collection ID is required' },
        { status: 400 }
      );
    }

    const libraryData = await getLibraryData(drive);
    const initialLength = libraryData.collections.length;
    libraryData.collections = libraryData.collections.filter(c => c.id !== id);
    if (initialLength === libraryData.collections.length) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Also remove this collection from any books that have it
    libraryData.books.forEach(book => {
      book.collections = book.collections.filter(collName => {
        // Keep collections if they are NOT this collection's name
        const coll = libraryData.collections.find(c => c.id === id);
        return coll ? collName !== coll.name : true;
      });
    });

    await saveLibraryData(drive, libraryData);
    return NextResponse.json({ message: 'Collection deleted' });
  } catch (error) {
    console.error('Error deleting collection:', error);
    return NextResponse.json(
      { error: 'Failed to delete collection' },
      { status: 500 }
    );
  }
}
