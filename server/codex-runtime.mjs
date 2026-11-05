import {accessSync, constants, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import lock from '../shared/codex-runtime.json' with {type:'json'};

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const executable = file => {try {accessSync(file, constants.X_OK);return statSync(file).isFile();} catch {return false;}};

/** Installed apps own their CLI. Developer overrides apply only to source runs. */
export function codexCommand({root=projectRoot, platform=process.platform, arch=process.arch, env=process.env, home=os.homedir()}={}) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.hitherPackaged === true) {
    try {
      const receipt = JSON.parse(readFileSync(path.join(root, 'runtime/codex/build.json'), 'utf8'));
      const artifact = lock.artifacts[`${platform}-${arch}`];
      const command = path.join(root, 'runtime/codex/bin', platform==='win32'?'codex.exe':'codex');
      if (!artifact || receipt.schemaVersion!==1 || receipt.version!==lock.version || receipt.platform!==platform || receipt.arch!==arch || receipt.integrity!==artifact.integrity || !executable(command)) throw new Error('Invalid bundled CLI.');
      return command;
    } catch (cause) {
      throw Object.assign(new Error('SecondU 内置执行组件缺失或版本不匹配，请重新安装完整的应用。', {cause}), {code:'CODEX_BUNDLE_INVALID'});
    }
  }
  const configured = env.HITHER_CODEX_BIN || env.HITHER_CODEX_BINARY;
  if (configured) return configured;
  for (const directory of (env.PATH??'').split(path.delimiter).filter(Boolean)) {
    const candidate = path.resolve(directory, platform==='win32'?'codex.exe':'codex');
    if (executable(candidate)) return candidate;
  }
  if (platform==='darwin') {
    const candidates = ['/opt/homebrew/bin/codex','/usr/local/bin/codex'];
    for (const apps of ['/Applications',path.join(home,'Applications')]) {
      candidates.push(path.join(apps,'Codex.app/Contents/Resources/codex'));
      for (const app of ['Codex.app','ChatGPT.app']) candidates.push(path.join(apps,app,'Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'));
    }
    const installed = candidates.find(executable);
    if (installed) return installed;
  }
  return 'codex';
}
