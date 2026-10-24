import { readFile, writeFile } from 'node:fs/promises';

const path = 'android/app/build.gradle';
let gradle = await readFile(path, 'utf8');
const marker = '// CLASSE_STABLE_SIGNING';
if (!gradle.includes(marker)) {
  gradle += `\n${marker}\ndef classeKeystore = System.getenv('ANDROID_KEYSTORE_FILE')\nif (classeKeystore) {\n    android.signingConfigs.create('classeStable') {\n        storeFile file(classeKeystore)\n        storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')\n        keyAlias System.getenv('ANDROID_KEY_ALIAS')\n        keyPassword System.getenv('ANDROID_KEY_PASSWORD')\n    }\n    android.buildTypes.getByName('debug').signingConfig = android.signingConfigs.getByName('classeStable')\n}\n`;
  await writeFile(path, gradle);
}
console.log('Signature Android stable configurée lorsqu’une clé est fournie.');
