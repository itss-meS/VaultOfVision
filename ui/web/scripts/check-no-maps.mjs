import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'dist';
const found = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.map')) found.push(full);
  }
}

walk(root);
if (found.length > 0) {
  console.error('source maps found in build output:\n' + found.join('\n'));
  process.exit(1);
}
console.log('no source maps in ' + root);
