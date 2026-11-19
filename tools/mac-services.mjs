import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

/** Keep launch agents on Homebrew's formula symlink across Node upgrades. */
export function serviceNodePath(executable) {
  const homebrew = executable.match(/^(\/opt\/homebrew|\/usr\/local)\/Cellar\/(node(?:@[^/]+)?)\/[^/]+\/bin\/node$/);
  return homebrew ? `${homebrew[1]}/opt/${homebrew[2]}/bin/node` : executable;
}

function main() {
  const { values } = parseArgs({ options: { install: { type: 'boolean', default: false }, tunnel: { type: 'boolean', default: false }, update: { type: 'boolean', default: false } } });
  if (values.update && !values.install) throw new Error('--update requires --install.');
  const root = process.cwd(), runtime = path.join(root, '.runtime'), directory = path.join(runtime, 'launchagents');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(runtime, 'logs'), { recursive: true, mode: 0o700 });
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const node = serviceNodePath(process.execPath);
  execFileSync(node, ['--version'], { stdio: 'pipe' });
  const envArgs = ['--env-file=.env.local', '--env-file=.env.production.local'];
  const definitions = values.tunnel ? [{ name: 'tunnel', args: [node, ...envArgs, 'tools/run-mac-service.mjs', 'tunnel'] }] : [
    { name: 'api', args: ['/usr/bin/caffeinate', '-i', node, ...envArgs, 'tools/run-mac-service.mjs', 'api'] },
    { name: 'downloader', args: [node, ...envArgs, 'tools/run-mac-service.mjs', 'downloader'], environment: { PORT: '4100', DOWNLOADER_HOST: '127.0.0.1' } },
  ];
  // Validate every selected definition before changing a running service.
  for (const definition of definitions) {
    if (!values.install) continue;
    if (definition.name === 'api' && !fs.existsSync(path.join(root, '.next-production', 'BUILD_ID'))) throw new Error('Build the production server first.');
    if (definition.name === 'tunnel' && !fs.existsSync(path.join(runtime, 'cloudflared/config.yml'))) throw new Error('Configure the named tunnel first.');
    const label = `com.karaoketrain.remote.${definition.name}`;
    const destination = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
    if (!fs.existsSync(destination)) continue;
    if (!values.update) throw new Error(`Service already exists: ${destination}. Use --install --update after reviewing it.`);
    const existing = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', destination], { encoding: 'utf8' }));
    if (existing.Label !== label || existing.WorkingDirectory !== root) throw new Error(`Refusing to replace a service from another project: ${destination}`);
  }
  for (const definition of definitions) {
    const label = `com.karaoketrain.remote.${definition.name}`;
    const servicePath = [...new Set([path.dirname(node), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':');
    const environment = { NODE_ENV: 'production', HOME: os.homedir(), PATH: servicePath,
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
      fs.mkdirSync(agents, { recursive: true });
      const domain = `gui/${process.getuid()}`, service = `${domain}/${label}`;
      const previous = fs.existsSync(destination);
      const backup = previous ? path.join(directory, 'backups', `${Date.now()}-${label}.plist`) : null;
      if (backup) {
        fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
        fs.copyFileSync(destination, backup, fs.constants.COPYFILE_EXCL); fs.chmodSync(backup, 0o600);
      }
      const status = spawnSync('/bin/launchctl', ['print', service], { stdio: 'ignore' });
      if (status.error) throw status.error;
      const loaded = status.status === 0;
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        if (loaded) execFileSync('/bin/launchctl', ['bootout', service], { stdio: 'pipe' });
        fs.copyFileSync(prepared, temporary, fs.constants.COPYFILE_EXCL); fs.chmodSync(temporary, 0o600);
        fs.renameSync(temporary, destination);
        execFileSync('/bin/launchctl', ['bootstrap', domain, destination], { stdio: 'pipe' });
      } catch (error) {
        if (backup) fs.copyFileSync(backup, destination);
        else fs.rmSync(destination, { force: true });
        if (loaded) {
          const restored = spawnSync('/bin/launchctl', ['bootstrap', domain, destination], { stdio: 'pipe' });
          if (restored.status !== 0) console.error(`Previous service definition restored; inspect ${label} before restarting.`);
        }
        throw error;
      } finally { fs.rmSync(temporary, { force: true }); }
      console.log(`Installed ${label}`);
    } else console.log(`Prepared ${prepared}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
