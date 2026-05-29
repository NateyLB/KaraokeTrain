import { Storage } from '@google-cloud/storage';

async function test() {
  try {
    const storage = new Storage();
    const bucket = storage.bucket('stems-lyrics');
    const file = bucket.file('processedSongs/7h9a_0opSIQ/vocals.wav');
    
    const [exists] = await file.exists();
    console.log('Exists?', exists);
    
    if (exists) {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
      });
      console.log('Signed URL:', url);
    }
  } catch (err) {
    console.error('ERROR:', err);
  }
}

test();
