import { Storage } from '@google-cloud/storage';

async function test() {
  const storage = new Storage();
  const bucket = storage.bucket('karaoketrain-storage');
  const file = bucket.file('processedSongs/7h9a_0opSIQ/vocals.wav');
  
  const [exists] = await file.exists();
  console.log('Exists?', exists);
  
  if (exists) {
    const [metadata] = await file.getMetadata();
    console.log('Metadata size:', metadata.size);
    
    const stream = file.createReadStream();
    console.log('Is stream async iterable?', typeof stream[Symbol.asyncIterator]);
    
    // Test taking the first chunk
    try {
      const iterator = stream[Symbol.asyncIterator]();
      const { value, done } = await iterator.next();
      console.log('First chunk size:', value?.length, 'done?', done);
    } catch (e) {
      console.error('Iterator error:', e);
    }
  }
}

test().catch(console.error);
