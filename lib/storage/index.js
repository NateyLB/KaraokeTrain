import { Storage } from '@google-cloud/storage';
import { SongStorage } from './SongStorage.js';

const mode = process.env.STORAGE_MODE || 'local';
const bucketName = process.env.GCS_BUCKET_NAME;
const key = `${mode}:${bucketName || ''}:${process.cwd()}`;
if (!global.karaokeStorage || global.karaokeStorage.key !== key) {
  const bucket = mode === 'gcs' && bucketName ? new Storage({
    timeout: 15000,
    retryOptions: { maxRetries: 2, totalTimeout: 30, maxRetryDelay: 4 },
  }).bucket(bucketName) : null;
  global.karaokeStorage = { key, repository: new SongStorage({ mode, bucket }) };
}
const repository = global.karaokeStorage.repository;

export const uploadFile = (...args) => repository.uploadFile(...args);
export const uploadJson = (...args) => repository.uploadJson(...args);
export const checkCache = id => repository.checkCache(id);
export const getSavedTranscription = id => repository.getSavedTranscription(id);
export const getFileStream = (...args) => repository.getFileStream(...args);
export const getCachedCatalog = () => repository.getCachedCatalog();
