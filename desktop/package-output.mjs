import { rename, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';

// Keep the previous build only while switching the verified staged application.
// A failed switch restores it; a successful switch leaves one output app.
export async function replacePackagedApp(stagedApp, destination) {
  if (path.resolve(stagedApp) === path.resolve(destination)) throw new Error('Package staging and output must differ.');
  const previous = path.join(path.dirname(stagedApp), '.previous.app');
  let movedPrevious = false;
  try {
    await rename(destination, previous);
    movedPrevious = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await rename(stagedApp, destination);
  } catch (error) {
    if (movedPrevious) await rename(previous, destination);
    throw error;
  }
  if (movedPrevious) await rm(previous, { recursive: true });
  await rmdir(path.dirname(stagedApp));
}
