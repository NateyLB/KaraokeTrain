import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const storageMode = process.env.STORAGE_MODE || 'local';
const bucketName = process.env.GCS_BUCKET_NAME;

let storage = null;
let bucket = null;

if (storageMode === 'gcs') {
  if (!bucketName) {
    console.error('STORAGE_MODE is gcs but GCS_BUCKET_NAME is not set!');
  } else {
    storage = new Storage();
    bucket = storage.bucket(bucketName);
  }
}

/**
 * Uploads a local file to GCS if in GCS mode.
 * @param {string} localFilePath - Absolute path to the local file
 * @param {string} destinationKey - The object key (path) in the GCS bucket
 */
export async function uploadFile(localFilePath, destinationKey) {
  if (storageMode !== 'gcs' || !bucket) return;
  
  await bucket.upload(localFilePath, {
    destination: destinationKey,
    // Resumable uploads are better for large files (audio stems)
    resumable: true,
  });
  console.log(`Uploaded ${localFilePath} to gs://${bucketName}/${destinationKey}`);
}

/**
 * Uploads an entire directory to GCS recursively.
 */
export async function uploadDirectory(localDir, gcsPrefix) {
  if (storageMode !== 'gcs' || !bucket) return;
  
  if (!fs.existsSync(localDir)) return;
  
  const files = fs.readdirSync(localDir);
  for (const file of files) {
    const localPath = path.join(localDir, file);
    const gcsPath = path.posix.join(gcsPrefix, file);
    
    if (fs.statSync(localPath).isDirectory()) {
      await uploadDirectory(localPath, gcsPath);
    } else {
      await uploadFile(localPath, gcsPath);
    }
  }
}

/**
 * Checks if a video has already been processed and cached in GCS or locally.
 * Returns the metadata object if found, otherwise null.
 */
export async function checkCache(videoId) {
  const localMetadataPath = path.join(process.cwd(), 'uploads', videoId, 'metadata.json');
  const gcsPath = `processedSongs/${videoId}/metadata.json`;

  if (storageMode === 'gcs' && bucket) {
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (exists) {
      try {
        const [contents] = await file.download();
        return JSON.parse(contents.toString());
      } catch (e) {
        console.error("Failed to read metadata from GCS:", e);
      }
    }
  }

  return null;
}

/**
 * Uploads a JSON object directly to GCS.
 */
export async function uploadJson(jsonObject, destinationKey) {
  if (storageMode !== 'gcs' || !bucket) return;
  try {
    const file = bucket.file(destinationKey);
    await file.save(JSON.stringify(jsonObject, null, 2), {
      contentType: 'application/json'
    });
    console.log(`Uploaded JSON to gs://${bucketName}/${destinationKey}`);
  } catch (e) {
    console.error("Failed to upload JSON to GCS:", e);
  }
}

/**
 * Gets a read stream for a file (either local or from GCS).
 * Uses videoId instead of jobId.
 */
export async function getFileStream(videoId, stem) {
  const localStemPath = path.join(process.cwd(), 'uploads', videoId, 'htdemucs', 'input', `${stem}.wav`);
  const gcsPath = `processedSongs/${videoId}/${stem}.wav`;

  if (storageMode === 'gcs' && bucket) {
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }
    
    const [metadata] = await file.getMetadata();
    return {
      stream: file.createReadStream(),
      size: parseInt(metadata.size, 10),
      source: 'gcs',
      gcsFile: file
    };
  } else {
    // Local mode (if the user actually overrides to local storage)
    if (!fs.existsSync(localStemPath)) return null;
    return {
      stream: fs.createReadStream(localStemPath),
      size: fs.statSync(localStemPath).size,
      source: 'local'
    };
  }
}
