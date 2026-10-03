import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installBridge,verifyShell,releaseVersion,configureRelease,configureCompatibility,APP_ID,HEALTH_PERMISSIONS} from './prepare.mjs';
import {decodeKeystore} from './restore-keystore.mjs';
const fixture=()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'phatbot-android-test-'));
  fs.mkdirSync(path.join(root,'app/src/main/assets/public'),{recursive:true});
  fs.writeFileSync(path.join(root,'build.gradle'),"dependencies {\n        classpath 'com.android.tools.build:gradle:8.13.0'\n}\n");
  fs.writeFileSync(path.join(root,'app/build.gradle'),`apply plugin: 'com.android.application'\nandroid { namespace '${APP_ID}'\n defaultConfig { applicationId '${APP_ID}' } }\ndependencies {\n}\n`);
  fs.writeFileSync(path.join(root,'app/src/main/AndroidManifest.xml'),'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application></application></manifest>');
  fs.writeFileSync(path.join(root,'app/src/main/assets/public/index.html'),'fallback');
  fs.writeFileSync(path.join(root,'app/src/main/assets/capacitor.config.json'),JSON.stringify({appId:APP_ID,appName:'PHATBOT',webDir:'ios-shell',server:{url:'https://app.phatbotfit.com',cleartext:false,errorPath:'index.html'}}));
  return root;
};
test('new dispatch versionCodes increase; retries and invalid/range-overflow inputs fail',()=>{
  assert.deepEqual(releaseVersion('10','1','0.1.0'),{code:100010,name:'0.1.0-play.10'});
  assert.equal(releaseVersion('11','1','0.1.0').code,100011);
  for(const [run,attempt,version] of [['10','2','0.1.0'],['0','1','0.1.0'],['1;echo x','1','0.1.0'],['2100000000','1','0.1.0'],['1','1','bad\nversion']])assert.throws(()=>releaseVersion(run,attempt,version));
});
test('production identity, secure URL and offline fallback are enforced',()=>{
  const root=fixture();try{
    verifyShell(root);
    const file=path.join(root,'app/src/main/assets/capacitor.config.json'),original=JSON.parse(fs.readFileSync(file));
    for(const changed of [{...original,appId:'other.app'},{...original,appName:'Other'},{...original,server:{...original.server,url:'http://localhost'}},{...original,server:{...original.server,cleartext:true}}]){
      fs.writeFileSync(file,JSON.stringify(changed));assert.throws(()=>verifyShell(root));
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('debug and release use one persistent native bridge installer with six read permissions',()=>{
  const root=fixture();try{
    installBridge(root);
    const debug=fs.readFileSync('.github/workflows/build-android-apk.yml','utf8');
    assert.deepEqual(HEALTH_PERMISSIONS,['STEPS','ACTIVE_CALORIES_BURNED','EXERCISE','DISTANCE','HEART_RATE','SLEEP']);
    for(const workflow of [debug,fs.readFileSync('.github/workflows/build-android-release.yml','utf8')]) {
      assert.ok(workflow.includes('node scripts/android/prepare.mjs bridge'));
      assert.ok(workflow.includes('node scripts/android/prepare.mjs compatibility'));
    }
    const gradle=fs.readFileSync(path.join(root,'app/build.gradle'),'utf8');
    for(const dependency of ['androidx.health.connect:connect-client:1.1.0','org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2'])assert.ok(gradle.includes(dependency));
    assert.ok(fs.readFileSync(path.join(root,'build.gradle'),'utf8').includes('kotlin-gradle-plugin:2.1.20'));
    for(const name of ['MainActivity.java','HealthConnectPlugin.kt','HealthConnectReadAccess.kt','HealthConnectPrivacyActivity.java','HealthConnectOnboardingActivity.java'])assert.equal(fs.readFileSync(path.join(root,'app/src/main/java',...APP_ID.split('.'),name),'utf8'),fs.readFileSync('android-native/'+name,'utf8'));
    assert.equal(fs.readFileSync(path.join(root,'app/src/test/java',...APP_ID.split('.'),'HealthConnectReadAccessTest.kt'),'utf8'),fs.readFileSync('android-native/tests/HealthConnectReadAccessTest.kt','utf8'));
    const manifest=fs.readFileSync(path.join(root,'app/src/main/AndroidManifest.xml'),'utf8');
    assert.deepEqual([...manifest.matchAll(/android\.permission\.health\.READ_([A-Z_]+)/g)].map(match=>match[1]),HEALTH_PERMISSIONS);
    assert.doesNotMatch(manifest,/WRITE_|READ_HEALTH_DATA_IN_BACKGROUND|READ_HEALTH_DATA_HISTORY/);
    for(const required of ['com.google.android.apps.healthdata','androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE','android.intent.action.VIEW_PERMISSION_USAGE','android.intent.category.HEALTH_PERMISSIONS','android.permission.START_VIEW_PERMISSION_USAGE','androidx.health.ACTION_SHOW_ONBOARDING','android.health.connect.action.SHOW_ONBOARDING'])assert.ok(manifest.includes(required),required);
    const native=fs.readFileSync('android-native/HealthConnectPlugin.kt','utf8');
    assert.doesNotMatch(native,/RestingHeartRateRecord|HeartRateVariabilityRmssdRecord|WeightRecord|getWritePermission/);
    assert.match(native,/@ActivityCallback private fun permissionsResult/);
    assert.match(native,/startActivityForResult\(call,/);
    assert.match(native,/Build.VERSION.SDK_INT < 28/);
    assert.match(native,/coerceIn\(1, 14\)/);
    assert.match(fs.readFileSync('android-native/HealthConnectPrivacyActivity.java','utf8'),/https:\/\/app\.phatbotfit\.com\/privacy/);
    assert.match(fs.readFileSync('android-native/MainActivity.java','utf8'),/registerPlugin\(HealthConnectPlugin.class\)/);
    assert.throws(()=>installBridge(root)); // Template drift/repeated installation must not silently duplicate configuration.
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('provider visibility is inserted into existing queries without replacing them',()=>{
  const root=fixture();try{
    const file=path.join(root,'app/src/main/AndroidManifest.xml');
    fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('</manifest>','<queries><package android:name="existing.package" /></queries></manifest>'));
    installBridge(root);
    const manifest=fs.readFileSync(file,'utf8');
    assert.equal((manifest.match(/<queries>/g)||[]).length,1);
    assert.match(manifest,/<queries><package android:name="existing.package" \/><package android:name="com.google.android.apps.healthdata" \/>/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('release configuration writes version metadata and env references, never secret values',()=>{
  const root=fixture();try{
    configureRelease(root,{GITHUB_RUN_NUMBER:'42',GITHUB_RUN_ATTEMPT:'1'});
    assert.match(fs.readFileSync(path.join(root,'app/phatbot-version.properties'),'utf8'),/versionCode=100042/);
    const gradle=fs.readFileSync(path.join(root,'app/phatbot-release.gradle'),'utf8');
    assert.match(gradle,/System.getenv\('ANDROID_KEYSTORE_PASSWORD'\)/);
    assert.match(gradle,/task.dependsOn\(verifySigning\)/);
    assert.match(gradle,/debuggable false/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('keystore decoder accepts multiline Base64 but fails closed on missing or corrupt data',()=>{
  // These bytes are only an encoding fixture, not a key or a signing credential.
  assert.equal(decodeKeystore('aGVs\nbG8=').toString(),'hello');
  for(const value of [undefined,'','%%%','aGVsbG8','aGVsbG9='])assert.throws(()=>decodeKeystore(value));
});
test('Health Connect minimum SDK is applied without lowering newer platform requirements',()=>{
  const root=fixture();try{
    const file=path.join(root,'variables.gradle');
    fs.writeFileSync(file,'ext { minSdkVersion = 24 }');configureCompatibility(root);
    assert.match(fs.readFileSync(file,'utf8'),/minSdkVersion = 26/);
    configureCompatibility(root);assert.match(fs.readFileSync(file,'utf8'),/minSdkVersion = 26/);
    fs.writeFileSync(file,'ext { minSdkVersion = 28 }');configureCompatibility(root);
    assert.match(fs.readFileSync(file,'utf8'),/minSdkVersion = 28/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
