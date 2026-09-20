require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const bucketName = process.env.GCS_BUCKET_NAME;
const storage = new Storage();
const bucket = storage.bucket(bucketName);

const uploadsDir = path.join(__dirname, 'uploads');
const folders = fs.readdirSync(uploadsDir);

async function run() {
  for (const folder of folders) {
    const multiplexM4a = path.join(uploadsDir, folder, 'multiplex.m4a');
    if (fs.existsSync(multiplexM4a)) {
      console.log(`Uploading ${folder} to GCS...`);
      await bucket.upload(multiplexM4a, {
        destination: `processedSongs/${folder}/multiplex.m4a`,
        resumable: true,
      });
      console.log(`Uploaded ${folder} to GCS!`);
    }
  }
}

run().catch(console.error);
