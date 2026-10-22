import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..', '..');
const gen = join(root, 'android');
const flags = new Set(process.argv.slice(2));
const dev = flags.has('--dev-assets');
const strict = flags.has('--strict') || process.env.AGRIEDGE_STRICT === '1';

const KOTLIN_PLUGIN = "classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21'";
const MODELS = ['plantvillage-all', 'cassava', 'ip102', 'router'];
const REQUIRED_MODELS = ['plantvillage-all', 'cassava', 'ip102'];
const MODEL_FILES = ['vision.onnx', 'labels.json'];
const KNOWLEDGE = [
  'release_ed25519.pub',
  'banned_pesticides.json',
  'banned_pesticides.json.sig',
  'dosage_table.json',
  'dosage_table.json.sig',
  'chunks.jsonl',
  'model_manifest.json',
  'model_manifest.json.sig',
];
const REQUIRED_KNOWLEDGE = KNOWLEDGE.slice(0, 5);

const problems = [];
function missing(message, required) {
  if (required && strict) problems.push(message);
  else console.warn(`warning: ${message}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function edit(path, change) {
  const before = readFileSync(path, 'utf8');
  const after = change(before);
  if (after !== before) writeFileSync(path, after);
}

if (!existsSync(join(gen, 'app', 'build.gradle'))) fail('android project not found, run cap add android first');

const moduleSrc = join(root, 'native', 'agriedge-engine');
const moduleDest = join(gen, 'agriedge-engine');
if (!existsSync(moduleSrc)) fail('native/agriedge-engine is missing');
rmSync(moduleDest, { recursive: true, force: true });
cpSync(moduleSrc, moduleDest, { recursive: true, filter: (src) => !/[\\/]build([\\/]|$)/.test(src) });
cpSync(join(root, 'native', 'app.gradle'), join(gen, 'app', 'agriedge.gradle'));

edit(join(gen, 'build.gradle'), (g) => {
  if (g.includes('kotlin-gradle-plugin')) return g;
  const re = /(classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"])/;
  if (!re.test(g)) fail('could not find the Android Gradle plugin line in android/build.gradle');
  return g.replace(re, (m) => `${m}\n        ${KOTLIN_PLUGIN}`);
});

edit(join(gen, 'settings.gradle'), (s) => {
  if (s.includes(":agriedge-engine")) return s;
  return `${s.replace(/\s*$/, '')}\ninclude ':agriedge-engine'\n`;
});

edit(join(gen, 'app', 'build.gradle'), (g) => {
  if (g.includes("apply from: 'agriedge.gradle'")) return g;
  return `${g.replace(/\s*$/, '')}\n\napply from: 'agriedge.gradle'\n`;
});

const gradle = readFileSync(join(gen, 'app', 'build.gradle'), 'utf8');
const ns = gradle.match(/namespace\s+["']([^"']+)["']/);
if (!ns || !/^[A-Za-z0-9_.]+$/.test(ns[1])) fail('could not read the app namespace from android/app/build.gradle');
const activityDir = join(gen, 'app', 'src', 'main', 'java', ...ns[1].split('.'));
mkdirSync(activityDir, { recursive: true });
const activity = [
  `package ${ns[1]};`,
  '',
  'import ai.redesignededge.engine.AgriEdgeEnginePlugin;',
  'import android.os.Bundle;',
  'import com.getcapacitor.BridgeActivity;',
  '',
  'public class MainActivity extends BridgeActivity {',
  '    @Override',
  '    protected void onCreate(Bundle savedInstanceState) {',
  '        registerPlugin(AgriEdgeEnginePlugin.class);',
  '        super.onCreate(savedInstanceState);',
  '    }',
  '}',
  '',
].join('\n');
writeFileSync(join(activityDir, 'MainActivity.java'), activity);

const assets = join(gen, 'app', 'src', 'main', 'assets');
rmSync(join(assets, 'models'), { recursive: true, force: true });
rmSync(join(assets, 'knowledge'), { recursive: true, force: true });

let modelBytes = 0;
for (const id of MODELS) {
  const required = REQUIRED_MODELS.includes(id);
  const dir = join(repo, 'models', id);
  const present = MODEL_FILES.every((f) => existsSync(join(dir, f)));
  if (!present) {
    missing(`models/${id} needs ${MODEL_FILES.join(' and ')}`, required);
    continue;
  }
  mkdirSync(join(assets, 'models', id), { recursive: true });
  for (const f of MODEL_FILES) {
    cpSync(join(dir, f), join(assets, 'models', id, f));
    modelBytes += statSync(join(dir, f)).size;
  }
}

const sources = dev ? [join(repo, '.dev', 'knowledge'), join(repo, 'knowledge')] : [join(repo, 'knowledge')];
if (dev && !existsSync(sources[0])) console.warn('warning: .dev/knowledge not found, run python -m scripts.make_dev_assets');
mkdirSync(join(assets, 'knowledge'), { recursive: true });
const copied = [];
for (const name of KNOWLEDGE) {
  const from = sources.find((dir) => existsSync(join(dir, name)));
  if (!from) {
    missing(`knowledge/${name} not found`, REQUIRED_KNOWLEDGE.includes(name));
    continue;
  }
  cpSync(join(from, name), join(assets, 'knowledge', name));
  copied.push(name);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`error: ${p}`);
  fail('release build refused: required assets are missing');
}
console.log(`native plugin synced, ${(modelBytes / 1048576).toFixed(1)} MB of models, ${copied.length} knowledge files${dev ? ' (development assets allowed)' : ''}`);
