import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const APP_ID = 'com.nextleveldigitalmedia.phatbot';
export const HEALTH_PERMISSIONS = ['STEPS','ACTIVE_CALORIES_BURNED','EXERCISE','DISTANCE','HEART_RATE','RESTING_HEART_RATE','HEART_RATE_VARIABILITY','SLEEP','WEIGHT'];
function replaceOnce(text, marker, replacement) {
  if (text.split(marker).length !== 2) throw new Error(`Unexpected Capacitor template: ${marker}`);
  return text.replace(marker, replacement);
}
export function installBridge(root='android') {
  const rootGradle=path.join(root,'build.gradle'), appGradle=path.join(root,'app/build.gradle');
  let text=fs.readFileSync(rootGradle,'utf8');
  if(text.includes('kotlin-gradle-plugin'))throw new Error('Health Connect bridge already installed; generate a fresh Android project');
  const pluginLine=text.match(/^.*classpath 'com.android.tools.build:gradle:.*$/m)?.[0];
  if(!pluginLine)throw new Error('Android Gradle plugin dependency not found');
  text=replaceOnce(text,pluginLine,pluginLine+"\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20'");
  fs.writeFileSync(rootGradle,text);
  text=fs.readFileSync(appGradle,'utf8');
  text=replaceOnce(text,"apply plugin: 'com.android.application'","apply plugin: 'com.android.application'\napply plugin: 'org.jetbrains.kotlin.android'");
  text=replaceOnce(text,'dependencies {',"dependencies {\n    implementation 'androidx.health.connect:connect-client:1.1.0'\n    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2'");
  fs.writeFileSync(appGradle,text);
  const manifest=path.join(root,'app/src/main/AndroidManifest.xml');
  text=fs.readFileSync(manifest,'utf8');
  text=replaceOnce(text,'<application',HEALTH_PERMISSIONS.map(name=>`<uses-permission android:name="android.permission.health.READ_${name}" />`).join('\n    ')+'\n    <application');
  fs.writeFileSync(manifest,text);
  const target=path.join(root,'app/src/main/java',...APP_ID.split('.'));
  fs.mkdirSync(target,{recursive:true});
  for(const name of ['HealthConnectPlugin.kt','MainActivity.java'])fs.copyFileSync(path.join('android-native',name),path.join(target,name));
}
export function verifyShell(root='android') {
  const config=JSON.parse(fs.readFileSync(path.join(root,'app/src/main/assets/capacitor.config.json'),'utf8'));
  if(config.appId!==APP_ID||config.appName!=='PHATBOT'||config.webDir!=='ios-shell'||config.server?.url!=='https://app.phatbotfit.com'||config.server?.cleartext!==false||config.server?.errorPath!=='index.html')throw new Error('Unexpected PHATBOT production Capacitor configuration');
  const gradle=fs.readFileSync(path.join(root,'app/build.gradle'),'utf8');
  for(const field of ['namespace','applicationId'])if(!new RegExp(`${field}\\s*(?:=\\s*)?["']${APP_ID.replaceAll('.','\\.')}["']`).test(gradle))throw new Error(`Unexpected Android ${field}`);
  if(!fs.existsSync(path.join(root,'app/src/main/assets/public/index.html')))throw new Error('Missing offline shell fallback');
}
export function releaseVersion(runNumber,attempt,packageVersion) {
  if(attempt!=='1')throw new Error('Release reruns are disabled. Start a NEW workflow dispatch for a fresh versionCode.');
  if(!/^[1-9]\d*$/.test(runNumber??''))throw new Error('Invalid GitHub run number');
  const code=100000+Number(runNumber);
  if(!Number.isSafeInteger(code)||code>2100000000)throw new Error('Android versionCode out of range');
  if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(packageVersion))throw new Error('Invalid package versionName');
  return {code,name:`${packageVersion}-play.${runNumber}`};
}
export function configureRelease(root='android',env=process.env) {
  verifyShell(root);
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  const version=releaseVersion(env.GITHUB_RUN_NUMBER,env.GITHUB_RUN_ATTEMPT,pkg.version);
  fs.copyFileSync('scripts/android/release-signing.gradle',path.join(root,'app/phatbot-release.gradle'));
  const file=path.join(root,'app/build.gradle');
  fs.appendFileSync(file,"\napply from: 'phatbot-release.gradle'\n");
  fs.writeFileSync(path.join(root,'app/phatbot-version.properties'),`versionCode=${version.code}\nversionName=${version.name}\n`);
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`version_code=${version.code}\nversion_name=${version.name}\n`);
  console.log(`Android release ${version.name} (versionCode ${version.code})`);
  return version;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const command=process.argv[2];
    if(command==='bridge')installBridge();
    else if(command==='release')configureRelease();
    else if(command==='verify')verifyShell();
    else throw new Error('Expected bridge, release or verify command');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
