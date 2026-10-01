import fs from 'node:fs';
import path from 'node:path';
export function decodeKeystore(value) {
  const normalized=(value??'').replace(/\s/g,'');
  if(!normalized||normalized.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized))throw new Error('ANDROID_KEYSTORE_BASE64 is missing or invalid Base64');
  const bytes=Buffer.from(normalized,'base64');
  if(bytes.toString('base64')!==normalized)throw new Error('ANDROID_KEYSTORE_BASE64 is not canonical Base64');
  return bytes;
}
if(process.argv[1]?.endsWith('restore-keystore.mjs')) {
  try {
    if(!process.env.RUNNER_TEMP)throw new Error('Missing runner temporary directory');
    fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'phatbot-upload.jks'),decodeKeystore(process.env.ANDROID_KEYSTORE_BASE64),{mode:0o600,flag:'wx'});
    console.log('Upload keystore restored in runner temporary storage.');
  }catch(error){console.error(error.code?'Unable to write temporary upload keystore':error.message);process.exitCode=1;}
}
