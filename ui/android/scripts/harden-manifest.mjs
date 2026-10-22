import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const path = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(path)) {
  console.error('android project not found, run cap add android first');
  process.exit(1);
}

const permissions = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CAMERA',
];

let xml = readFileSync(path, 'utf8');

function setAttribute(tag, name, value) {
  const attr = new RegExp(`${name}="[^"]*"`);
  if (attr.test(tag)) return tag.replace(attr, `${name}="${value}"`);
  return tag.replace('<application', `<application ${name}="${value}"`);
}

const appOpen = /<application\b[^>]*>/;
const match = xml.match(appOpen);
if (!match) {
  console.error('application element not found');
  process.exit(1);
}
let tag = match[0];
tag = setAttribute(tag, 'android:allowBackup', 'false');
tag = setAttribute(tag, 'android:usesCleartextTraffic', 'false');
tag = setAttribute(tag, 'android:networkSecurityConfig', '@xml/network_security_config');
tag = tag.replace(/\s+android:debuggable="[^"]*"/, '');
xml = xml.replace(appOpen, () => tag);

xml = xml.replace(/[ \t]*<uses-permission(-sdk-23)?\b[^>]*\/>\r?\n?/g, '');
xml = xml.replace(/[ \t]*<uses-feature\b[^>]*\/>\r?\n?/g, '');
const additions = [
  '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
  ...permissions.map((p) => `    <uses-permission android:name="${p}" />`),
].join('\n');
xml = xml.replace('</manifest>', `${additions}\n</manifest>`);
writeFileSync(path, xml);

const gradlePath = 'android/app/build.gradle';
if (existsSync(gradlePath)) {
  const g = readFileSync(gradlePath, 'utf8').replace(/minifyEnabled false/, 'minifyEnabled true');
  writeFileSync(gradlePath, g);
}
console.log('manifest hardened');
