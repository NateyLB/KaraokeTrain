require('dotenv').config({ path: '.env.local' });
const { Storage } = require('@google-cloud/storage');
const bucketName = process.env.GCS_BUCKET_NAME;
const storage = new Storage();
const bucket = storage.bucket(bucketName);

async function run() {
  const [files] = await bucket.getFiles({ prefix: 'processedSongs/' });
  const songs = new Set();
  files.forEach(f => {
    const parts = f.name.split('/');
    if (parts.length > 1 && parts[1]) songs.add(parts[1]);
  });
  console.log(`Found ${songs.size} processed songs in GCS:`);
  console.log(Array.from(songs).join(', '));
}
run().catch(console.error);
