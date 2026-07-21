import { S3Client } from '@aws-sdk/client-s3';

// Initialize S3 client for iDrive
export const s3Client = new S3Client({
    endpoint: process.env.IDRIVE_ENDPOINT!,
    region: process.env.IDRIVE_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.IDRIVE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.IDRIVE_SECRET_ACCESS_KEY!,
    },
});

export const BUCKET_NAME = process.env.IDRIVE_BUCKET_NAME!;