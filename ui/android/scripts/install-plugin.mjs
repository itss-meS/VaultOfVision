import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shell = resolve(here, '..');
const repo = resolve(shell, '..', '..');
const app = join(shell, 'android', 'app');

const ONNX = 'com.microsoft.onnxruntime:onnxruntime-android:1.20.0';
const EXECUTORCH = 'org.pytorch:executorch-android:1.0.0';
const DEPENDENCIES = [
  ONNX,
  EXECUTORCH,
  'com.facebook.fbjni:fbjni:0.7.0',
  'com.facebook.soloader:nativeloader:0.10.5',
];
const KEEP_RULES = [
  '-keep class org.pytorch.executorch.** { *; }',
  '-keep class com.facebook.jni.** { *; }',
  '-keep class com.facebook.soloader.** { *; }',
  '-keep class ai.onnxruntime.** { *; }',
  '-keep class ai.redesignededge.app.AgriEdgeEnginePlugin { *; }',
];

if (!existsSync(app)) {
  console.error('android project not found, run cap add android first');
  process.exit(1);
}

const config = readFileSync(join(shell, 'capacitor.config.ts'), 'utf8');
const idMatch = /appId:\s*['"]([\w.]+)['"]/.exec(config);
if (!idMatch) {
  console.error('appId not found in capacitor.config.ts');
  process.exit(1);
}
const appId = idMatch[1];
const javaDir = join(app, 'src', 'main', 'java', ...appId.split('.'));
mkdirSync(javaDir, { recursive: true });

let source = readFileSync(join(shell, 'native', 'AgriEdgeEnginePlugin.java'), 'utf8');
source = source.replace(/^package\s+[\w.]+;/m, `package ${appId};`);
writeFileSync(join(javaDir, 'AgriEdgeEnginePlugin.java'), source);

const mainJava = join(javaDir, 'MainActivity.java');
const mainKt = join(javaDir, 'MainActivity.kt');
if (existsSync(mainKt)) {
  console.error('MainActivity.kt found; register AgriEdgeEnginePlugin there by hand');
  process.exit(1);
}
if (!existsSync(mainJava)) {
  console.error('MainActivity.java not found');
  process.exit(1);
}
writeFileSync(
  mainJava,
  `package ${appId};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AgriEdgeEnginePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`,
);

const gradlePath = join(app, 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
for (const dep of DEPENDENCIES) {
  if (!gradle.includes(dep)) {
    gradle = gradle.replace(/dependencies\s*\{/, (m) => `${m}\n    implementation '${dep}'`);
  }
}
if (!gradle.includes('abiFilters')) {
  gradle = gradle.replace(
    /defaultConfig\s*\{/,
    (m) => `${m}\n        ndk {\n            abiFilters 'arm64-v8a'\n        }`,
  );
}
if (!gradle.includes('noCompress')) {
  gradle = gradle.replace(
    /android\s*\{/,
    (m) => `${m}\n    androidResources {\n        noCompress += ['pte', 'onnx', 'model']\n    }`,
  );
}
if (!gradle.includes('pickFirsts')) {
  gradle = gradle.replace(
    /android\s*\{/,
    (m) =>
      `${m}\n    packaging {\n        jniLibs {\n            pickFirsts += ['**/libc++_shared.so', '**/libfbjni.so']\n        }\n    }`,
  );
}
writeFileSync(gradlePath, gradle);

const propsPath = join(shell, 'android', 'gradle.properties');
if (existsSync(propsPath)) {
  let props = readFileSync(propsPath, 'utf8');
  if (/^org\.gradle\.jvmargs=/m.test(props)) {
    props = props.replace(/^org\.gradle\.jvmargs=.*$/m, 'org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8');
  } else {
    props += `${props.endsWith('\n') ? '' : '\n'}org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8\n`;
  }
  writeFileSync(propsPath, props);
}

const rulesPath = join(app, 'proguard-rules.pro');
let rules = existsSync(rulesPath) ? readFileSync(rulesPath, 'utf8') : '';
for (const rule of KEEP_RULES) {
  if (!rules.includes(rule)) rules += `${rules.endsWith('\n') || rules === '' ? '' : '\n'}${rule}\n`;
}
writeFileSync(rulesPath, rules);

const assets = join(app, 'src', 'main', 'assets');
const modelsOut = join(assets, 'models');
rmSync(modelsOut, { recursive: true, force: true });
let bundled = 0;
const modelsIn = join(repo, 'models');
if (existsSync(modelsIn)) {
  for (const entry of readdirSync(modelsIn, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'router') continue;
    const onnx = join(modelsIn, entry.name, 'vision.onnx');
    const labels = join(modelsIn, entry.name, 'labels.json');
    if (!existsSync(onnx) || !existsSync(labels)) continue;
    const out = join(modelsOut, entry.name);
    mkdirSync(out, { recursive: true });
    copyFileSync(onnx, join(out, 'vision.onnx'));
    copyFileSync(labels, join(out, 'labels.json'));
    bundled += 1;
  }
}

let llamaFiles = 0;
for (const file of ['llama32_1b_int4.pte', 'tokenizer.model']) {
  const from = join(modelsIn, file);
  if (existsSync(from)) {
    mkdirSync(modelsOut, { recursive: true });
    copyFileSync(from, join(modelsOut, file));
    llamaFiles += 1;
  }
}
if (llamaFiles === 0) {
  console.warn('Llama files not found in models/, chat will need them pushed with adb');
}

const knowledgeOut = join(assets, 'knowledge');
rmSync(knowledgeOut, { recursive: true, force: true });
mkdirSync(knowledgeOut, { recursive: true });
for (const dir of [join(repo, 'knowledge'), join(repo, '.dev', 'knowledge')]) {
  if (existsSync(dir)) cpSync(dir, knowledgeOut, { recursive: true });
}
for (const needed of ['release_ed25519.pub', 'banned_pesticides.json', 'dosage_table.json']) {
  if (!existsSync(join(knowledgeOut, needed))) {
    console.warn(`knowledge/${needed} is missing, so advice and chat will not start`);
  }
}

console.log(`plugin installed for ${appId}, ${bundled} vision model(s) and ${llamaFiles} Llama file(s) bundled`);
