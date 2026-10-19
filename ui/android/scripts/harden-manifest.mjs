import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const path = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(path)) {
  console.error('android project not found, run cap add android first');
  process.exit(1);
}

let xml = readFileSync(path, 'utf8');
const app = '<application';
if (!xml.includes('android:allowBackup="false"')) {
  xml = xml.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"');
}
if (!xml.includes('android:usesCleartextTraffic')) {
  xml = xml.replace(app, `${app} android:usesCleartextTraffic="false"`);
}
const perms = ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'];
for (const p of perms) {
  if (!xml.includes(p)) {
    xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}
writeFileSync(path, xml);

const gradlePath = 'android/app/build.gradle';
if (existsSync(gradlePath)) {
  const g = readFileSync(gradlePath, 'utf8').replace(/minifyEnabled false/, 'minifyEnabled true');
  writeFileSync(gradlePath, g);
}
console.log('manifest hardened');
