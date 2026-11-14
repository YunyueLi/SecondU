import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HttpError } from './http-error.mjs';

// Fixed native dialog scripts; no request values are interpolated into code.
// JSON preserves filenames with spaces, quotes and newlines without guessing a
// delimiter. The library separately validates each selected path before reading.
const mac = `var app = Application.currentApplication(); app.includeStandardAdditions = true;
try { var files = app.chooseFile({withPrompt: '选择加入资料集的文件，可多选', multipleSelectionsAllowed: true}); JSON.stringify(files.map(function(file) { return file.toString(); })); }
catch (error) { if (error.errorNumber === -128) '[]'; else throw error; }`;
const windows = '$ErrorActionPreference="Stop"; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $picker=New-Object System.Windows.Forms.OpenFileDialog; $picker.Multiselect=$true; $picker.Title="Choose library files"; try { if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { ConvertTo-Json -InputObject @($picker.FileNames) -Compress } else { "[]" } } finally { $picker.Dispose() }';

export function createFileChooser({ platform = process.platform, run = promisify(execFile) } = {}) {
  let active = false;
  return async function chooseFiles({ signal } = {}) {
    if (active) throw new HttpError(409, '已有文件选择窗口，请先完成或取消。', 'file_picker_busy');
    const command = platform === 'darwin' ? ['/usr/bin/osascript', ['-l', 'JavaScript', '-e', mac]] : platform === 'win32' ? ['powershell.exe', ['-NoLogo', '-NoProfile', '-STA', '-Command', windows]] : null;
    if (!command) throw new HttpError(501, '当前系统请使用完整文件路径，或选择整个文件夹。', 'file_picker_unavailable');
    active = true;
    try {
      const { stdout } = await run(...command, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000, windowsHide: true, signal });
      const paths = JSON.parse(stdout);
      if (!Array.isArray(paths) || paths.some(item => typeof item !== 'string')) throw new Error('Invalid picker response');
      return paths;
    } catch (error) {
      if (error.name === 'AbortError' || signal?.aborted) throw new HttpError(499, '文件选择已取消。', 'file_picker_cancelled');
      if (error.killed) throw new HttpError(408, '文件选择已超时，请重新选择。', 'file_picker_timeout');
      throw new HttpError(503, '无法完成文件选择，请重试、输入路径或选择文件夹。', 'file_picker_failed');
    } finally { active = false; }
  };
}
export const chooseLibraryFiles = createFileChooser();
