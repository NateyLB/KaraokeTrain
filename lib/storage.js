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
 * Gets a read stream for a file (either local or from GCS).
 */
export async function getFileStream(jobId, stem) {
  const localStemPath = path.join(process.cwd(), 'uploads', jobId, 'htdemucs', 'input', `${stem}.wav`);
  const gcsPath = `uploads/${jobId}/htdemucs/input/${stem}.wav`;

  if (storageMode === 'gcs' && bucket) {
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
      // Fallback to local if not found in GCS
      if (fs.existsSync(localStemPath)) {
        return {
          stream: fs.createReadStream(localStemPath),
          size: fs.statSync(localStemPath).size,
          source: 'local'
        };
      }
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
    // Local mode
    if (!fs.existsSync(localStemPath)) return null;
    return {
      stream: fs.createReadStream(localStemPath),
      size: fs.statSync(localStemPath).size,
      source: 'local'
    };
  }
}
