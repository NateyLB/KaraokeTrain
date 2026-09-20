const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const pythonPath = path.join(os.homedir(), 'Desktop', 'GenAIProjects', 'MusicPractice', 'backend', '.venv', 'bin', 'python3');
const p = spawn(pythonPath, ['-m', 'demucs', '--out', 'testout', '-d', 'cpu', 'input.m4a']);
p.stdout.on('data', d => process.stdout.write(d));
p.stderr.on('data', d => process.stderr.write(d));
p.on('close', c => console.log('code:', c));
