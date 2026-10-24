import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let xml = await readFile(manifestPath, 'utf8');
const permissions = [
  'android.permission.CAMERA',
  'android.permission.POST_NOTIFICATIONS',
];

for (const permission of permissions) {
  const declaration = `    <uses-permission android:name="${permission}" />`;
  if (!xml.includes(`android:name="${permission}"`)) {
    xml = xml.replace('<manifest ', `<manifest `).replace(/(<manifest[^>]*>)/, `$1\n${declaration}`);
  }
}

await writeFile(manifestPath, xml);
console.log(`Permissions Android configurées dans ${manifestPath}`);
