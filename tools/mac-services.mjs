import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { install: { type: 'boolean', default: false }, tunnel: { type: 'boolean', default: false } } });
const root = process.cwd(), runtime = path.join(root, '.runtime'), directory = path.join(runtime, 'launchagents');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(runtime, 'logs'), { recursive: true, mode: 0o700 });
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const node = process.execPath;
const envArgs = ['--env-file=.env.local', '--env-file=.env.production.local'];
const definitions = values.tunnel ? [{ name: 'tunnel', args: [node, ...envArgs, 'tools/run-mac-service.mjs', 'tunnel'] }] : [
  { name: 'api', args: ['/usr/bin/caffeinate', '-i', node, ...envArgs, 'tools/run-mac-service.mjs', 'api'] },
  { name: 'downloader', args: [node, ...envArgs, 'tools/run-mac-service.mjs', 'downloader'], environment: { PORT: '4100', DOWNLOADER_HOST: '127.0.0.1' } },
];
for (const definition of definitions) {
  const label = `com.karaoketrain.remote.${definition.name}`;
  const environment = { NODE_ENV: 'production', HOME: os.homedir(), PATH: process.env.PATH,
    KARAOKE_BUILD_DIR: '.next-production', ...definition.environment };
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${definition.args.map(value => `<string>${escape(value)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${escape(root)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([key, value]) => `<key>${escape(key)}</key><string>${escape(value)}</string>`).join('')}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>${escape(path.join(runtime, 'logs', definition.name + '.log'))}</string>
<key>StandardErrorPath</key><string>${escape(path.join(runtime, 'logs', definition.name + '.error.log'))}</string>
</dict></plist>\n`;
  const prepared = path.join(directory, `${label}.plist`);
  fs.writeFileSync(prepared, plist, { mode: 0o600 });
  execFileSync('/usr/bin/plutil', ['-lint', prepared], { stdio: 'pipe' });
  if (values.install) {
    const agents = path.join(os.homedir(), 'Library', 'LaunchAgents'), destination = path.join(agents, path.basename(prepared));
    if (fs.existsSync(destination)) throw new Error(`Service already exists: ${destination}. Inspect it before replacement.`);
    if (definition.name === 'api' && !fs.existsSync(path.join(root, '.next-production', 'BUILD_ID'))) throw new Error('Build the production server first.');
    if (definition.name === 'tunnel' && !fs.existsSync(path.join(runtime, 'cloudflared/config.yml'))) throw new Error('Configure the named tunnel first.');
    fs.mkdirSync(agents, { recursive: true });
    fs.copyFileSync(prepared, destination); fs.chmodSync(destination, 0o600);
    execFileSync('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, destination], { stdio: 'pipe' });
    console.log(`Installed ${label}`);
  } else console.log(`Prepared ${prepared}`);
}
