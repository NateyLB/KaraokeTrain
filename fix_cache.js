const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { uploadFile } = require('./lib/storage.js');

const uploadsDir = path.join(__dirname, 'uploads');
const folders = fs.readdirSync(uploadsDir);

async function run() {
  for (const folder of folders) {
    const videoDir = path.join(uploadsDir, folder);
    const noVocalsWav = path.join(videoDir, 'htdemucs', 'input', 'no_vocals.wav');
    const vocalsWav = path.join(videoDir, 'htdemucs', 'input', 'vocals.wav');
    const multiplexM4a = path.join(videoDir, 'multiplex.m4a');

    if (fs.existsSync(noVocalsWav) && fs.existsSync(vocalsWav)) {
      if (!fs.existsSync(multiplexM4a)) {
        console.log(`Multiplexing ${folder}...`);
        await new Promise((resolve, reject) => {
          const ffmpegArgs = [
            '-y',
            '-i', noVocalsWav,
            '-i', vocalsWav,
            '-filter_complex', '[0:a]pan=1c|c0=0.5*c0+0.5*c1[m0]; [1:a]pan=1c|c0=0.5*c0+0.5*c1[m1]; [m0][m1]amerge=inputs=2[a]',
            '-map', '[a]',
            '-c:a', 'aac',
            '-b:a', '256k',
            multiplexM4a
          ];
          const ffmpeg = spawn('ffmpeg', ffmpegArgs);
          ffmpeg.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg failed with code ${code}`));
          });
        });
        console.log(`Uploaded ${folder} multiplex!`);
      }
      
      console.log(`Uploading ${folder} to GCS...`);
      await uploadFile(multiplexM4a, `processedSongs/${folder}/multiplex.m4a`);
    }
  }
}

run().catch(console.error);
