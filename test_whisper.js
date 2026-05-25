const { spawn } = require('child_process');
const fs = require('fs');

const lyrics = `Biết là mình thích nhau
Còn chuyện xa hơn thôi để tính sau
Họ vờn nhau thôi không đúng đâu
Dân chơi thì chơi là phải trúng
Còn anh chỉ muốn chậm thôi không cần quá liều
Oh anh chưa muốn đâm đầu vậy đâu
Anh chưa thiết tha nghĩ tới chuyện sau này
Dù ba mẹ chờ mong, em biết không?
Họ muốn có cháu bồng
Chỉ cần ngồi với em chút thôi
Được không?
Nhìn vào đôi mắt em
Thấy sao một thế giới màu hồng`;

fs.writeFileSync('/tmp/test_lyrics.txt', lyrics);

const pythonProcess = spawn('/Users/Nate/Desktop/GenAIProjects/MusicPractice/backend/.venv/bin/python3', [
  '/Users/Nate/Desktop/GenAIProjects/KaraokeStreaming/lib/whisper_align.py',
  '--wav', '/Users/Nate/Desktop/GenAIProjects/KaraokeStreaming/uploads/c48a5cd3-ce23-41f8-bd43-dd0c01a577e9/htdemucs/input/vocals.wav',
  '--lyrics', '/tmp/test_lyrics.txt'
]);

pythonProcess.stderr.on('data', d => console.error(d.toString()));
pythonProcess.stdout.on('data', d => console.log(d.toString().substring(0, 500)));
