require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Storage } = require('@google-cloud/storage');

const bucketName = process.env.GCS_BUCKET_NAME;
const storage = new Storage();
const bucket = storage.bucket(bucketName);

const tmpDir = path.join(__dirname, 'tmp_gcs_multiplex');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

async function run() {
  console.log("Fetching list of processed songs...");
  const [files] = await bucket.getFiles({ prefix: 'processedSongs/' });
  
  const songs = new Set();
  files.forEach(f => {
    const parts = f.name.split('/');
    if (parts.length > 1 && parts[1]) songs.add(parts[1]);
  });
  
  console.log(`Found ${songs.size} songs in GCS. Checking for missing multiplex.m4a...`);
  
  for (const song of songs) {
    const multiplexPath = `processedSongs/${song}/multiplex.m4a`;
    const vocalsPath = `processedSongs/${song}/vocals.wav`;
    const noVocalsPath = `processedSongs/${song}/no_vocals.wav`;
    
    const [multiplexExists] = await bucket.file(multiplexPath).exists();
    if (!multiplexExists) {
      console.log(`[${song}] Missing multiplex.m4a! Processing...`);
      
      const songTmpDir = path.join(tmpDir, song);
      if (!fs.existsSync(songTmpDir)) fs.mkdirSync(songTmpDir);
      
      const localVocals = path.join(songTmpDir, 'vocals.wav');
      const localNoVocals = path.join(songTmpDir, 'no_vocals.wav');
      const localMultiplex = path.join(songTmpDir, 'multiplex.m4a');
      
      try {
        console.log(`[${song}] Downloading stems...`);
        const [vocalsExists] = await bucket.file(vocalsPath).exists();
        const [noVocalsExists] = await bucket.file(noVocalsPath).exists();
        
        if (!vocalsExists || !noVocalsExists) {
           console.log(`[${song}] Missing wav files in GCS, skipping...`);
           continue;
        }

        await bucket.file(vocalsPath).download({ destination: localVocals });
        await bucket.file(noVocalsPath).download({ destination: localNoVocals });
        
        console.log(`[${song}] Multiplexing...`);
        await new Promise((resolve, reject) => {
          const ffmpegArgs = [
            '-y',
            '-i', localNoVocals,
            '-i', localVocals,
            '-filter_complex', '[0:a]pan=1c|c0=0.5*c0+0.5*c1[m0]; [1:a]pan=1c|c0=0.5*c0+0.5*c1[m1]; [m0][m1]amerge=inputs=2[a]',
            '-map', '[a]',
            '-c:a', 'aac',
            '-b:a', '256k',
            localMultiplex
          ];
          const ffmpeg = spawn('ffmpeg', ffmpegArgs);
          ffmpeg.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg failed with code ${code}`));
          });
        });
        
        console.log(`[${song}] Uploading multiplex.m4a...`);
        await bucket.upload(localMultiplex, {
          destination: multiplexPath,
          resumable: true
        });
        console.log(`[${song}] DONE!`);
        
      } catch (err) {
        console.error(`[${song}] Error:`, err);
      } finally {
        // Cleanup local temp files
        if (fs.existsSync(localVocals)) fs.unlinkSync(localVocals);
        if (fs.existsSync(localNoVocals)) fs.unlinkSync(localNoVocals);
        if (fs.existsSync(localMultiplex)) fs.unlinkSync(localMultiplex);
        if (fs.existsSync(songTmpDir)) fs.rmdirSync(songTmpDir);
      }
    } else {
      console.log(`[${song}] OK (Already has multiplex.m4a)`);
    }
  }
  
  console.log("All songs processed!");
  if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
}

run().catch(console.error);
