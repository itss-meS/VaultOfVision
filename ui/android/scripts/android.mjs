import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
const modes = ['prepare', 'test', 'debug', 'release'];
if (!modes.includes(mode)) {
  console.error(`usage: node scripts/android.mjs ${modes.join('|')}`);
  process.exit(2);
}

function run(command, cwd = root) {
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm --prefix ../web run build');
if (!existsSync(join(root, 'android'))) run('npx cap add android');
run('npx cap sync android');
run('node scripts/harden-manifest.mjs');
const flag = mode === 'debug' ? ' --dev-assets' : mode === 'release' ? ' --strict' : '';
run(`node scripts/sync-native.mjs${flag}`);
if (mode === 'prepare') process.exit(0);

const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const task = { test: ':agriedge-engine:testDebugUnitTest', debug: 'assembleDebug', release: 'assembleRelease' }[mode];
run(`${gradle} ${task} --no-daemon`, join(root, 'android'));
