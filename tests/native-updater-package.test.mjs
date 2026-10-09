import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile,symlink,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyUpdaterPlist,frameworkInventory,validateUpdaterConfig,updaterPlistValues} from '../desktop/build-updater.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config={feedURL:'https://example.invalid/updates/appcast.xml',publicEDKey:Buffer.alloc(32,7).toString('base64')};

test('updater package fixes HTTPS and EdDSA configuration without runtime overrides',()=>{
  assert.deepEqual(validateUpdaterConfig(config),config);
  for(const patch of [{feedURL:'http://example.invalid/feed'},{feedURL:'https://person:secret@example.invalid/feed'},{feedURL:'https://example.invalid/feed?override=1'},{feedURL:'https://example.invalid/feed#other'},{publicEDKey:'not-a-key'},{publicEDKey:Buffer.alloc(31).toString('base64')},{privateKey:'never-read'}])assert.throws(()=>validateUpdaterConfig({...config,...patch}));
  assert.deepEqual(updaterPlistValues(config),{SUFeedURL:config.feedURL,SUPublicEDKey:config.publicEDKey,SUEnableAutomaticChecks:false,SUAutomaticallyUpdate:false,SUAllowsAutomaticUpdates:false,SUVerifyUpdateBeforeExtraction:true,SUEnableSystemProfiling:false,SUEnableJavaScript:false});
});

test('package plist preserves existing identity and fails on conflicting updater keys',()=>{
  const input='<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleVersion</key><string>0.1.5</string><key>LSMinimumSystemVersion</key><string>13.0</string></dict></plist>';
  const output=applyUpdaterPlist(input,config);
  assert.match(output,/<key>CFBundleVersion<\/key><string>0\.1\.5<\/string>/);
  assert.match(output,/<key>SUVerifyUpdateBeforeExtraction<\/key>\s*<true\/>/);
  assert.match(output,/<key>SUAllowsAutomaticUpdates<\/key>\s*<false\/>/);
  assert.throws(()=>applyUpdaterPlist(output,config));
  assert.throws(()=>applyUpdaterPlist(input.replace('<string>13.0</string>','<string>12.0</string>'),config),/minimum macOS 13.0/);
  assert.throws(()=>applyUpdaterPlist(input.replace('<string>13.0</string>','<string>14.0</string>'),config),/minimum macOS 13.0/);
  assert.throws(()=>applyUpdaterPlist('<plist><array/></plist>',config));
});

test('framework comparison includes code bytes, executable mode and symlink targets',async t=>{
  const tmp=await mkdtemp(path.join(os.tmpdir(),'secondu-updater-inventory-'));t.after(()=>rm(tmp,{recursive:true,force:true}));
  await mkdir(path.join(tmp,'Versions/A'),{recursive:true});await writeFile(path.join(tmp,'Versions/A/Sparkle'),'fixture-code');await chmod(path.join(tmp,'Versions/A/Sparkle'),0o755);await symlink('A',path.join(tmp,'Versions/Current'));
  const before=await frameworkInventory(tmp);assert.equal(before.find(f=>f.path==='Versions/Current').target,'A');assert.equal(before.find(f=>f.path==='Versions/A/Sparkle').mode,0o755);
  await writeFile(path.join(tmp,'Versions/A/Sparkle'),'changed-code');assert.notEqual((await frameworkInventory(tmp)).find(f=>f.type==='file').sha256,before.find(f=>f.type==='file').sha256);
});

test('native relaunch gate fails closed and consumes each continuation once',{skip:process.platform!=='darwin'?'requires Objective-C runtime':false},async t=>{
  try{execFileSync('/usr/bin/xcrun',['--find','clang++'],{stdio:'ignore'});}catch{return t.skip('Xcode command line tools unavailable');}
  const tmp=await mkdtemp(path.join(os.tmpdir(),'secondu-updater-gate-'));t.after(()=>rm(tmp,{recursive:true,force:true}));
  const source=path.join(tmp,'gate.mm'),binary=path.join(tmp,'gate');
  await writeFile(source,`#import <Foundation/Foundation.h>\n#import "RelaunchGate.h"\nint main(){@autoreleasepool{SURelaunchGate *gate=[SURelaunchGate new]; __block int count=0; if([gate resume:@"missing"])return 1; NSString *first=[gate defer:^{count++;}]; if(count||[gate resume:@"wrong"])return 2; NSString *second=[gate defer:^{count+=10;}]; if([gate resume:first]||count)return 3; if(![gate resume:second]||count!=10||[gate resume:second])return 4; NSString *cancel=[gate defer:^{count+=100;}];[gate invalidate];if([gate resume:cancel]||count!=10)return 5; __block NSString *reentrant; reentrant=[gate defer:^{count++;if([gate resume:reentrant])exit(6);}];if(![gate resume:reentrant]||count!=11)return 7;puts("one-shot relaunch gate passed");}return 0;}\n`);
  execFileSync('/usr/bin/xcrun',['clang++','-fobjc-arc','-fblocks','-framework','Foundation','-I',path.join(root,'desktop/native'),source,path.join(root,'desktop/native/RelaunchGate.mm'),'-o',binary],{stdio:'pipe'});
  assert.match(execFileSync(binary,{encoding:'utf8'}),/one-shot relaunch gate passed/);
});

test('native download counter handles unknown, repeated, inconsistent and overflowing lengths',{skip:process.platform!=='darwin'?'requires native compiler':false},async t=>{
  try{execFileSync('/usr/bin/xcrun',['--find','clang++'],{stdio:'ignore'});}catch{return t.skip('Xcode command line tools unavailable');}
  const tmp=await mkdtemp(path.join(os.tmpdir(),'secondu-updater-progress-'));t.after(()=>rm(tmp,{recursive:true,force:true}));
  const source=path.join(tmp,'progress.cc'),binary=path.join(tmp,'progress');
  await writeFile(source,`#include "DownloadProgress.h"\nint main(){SUDownloadProgress p;if(p.hasTotal())return 1;p.total=100;p.add(40);if(!p.hasTotal()||p.received!=40)return 2;p.total=200;p.add(70);if(p.received!=110||!p.hasTotal())return 3;p.total=100;if(p.hasTotal())return 4;p.reset();p.add(SUDownloadProgress::maximumSafeInteger);p.add(1);if(!p.overflow||p.hasTotal())return 5;p.reset();p.total=50;p.add(50);if(p.overflow||!p.hasTotal()||p.received!=50)return 6;return 0;}\n`);
  execFileSync('/usr/bin/xcrun',['clang++','-std=c++17','-I',path.join(root,'desktop/native'),source,'-o',binary],{stdio:'pipe'});
  execFileSync(binary,{stdio:'pipe'});
});
