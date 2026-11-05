import { lstat, mkdtemp, rename, rm, rmdir } from 'node:fs/promises';
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

// Own the complete build lifetime, including partial bundles and native objects.
// An old deliverable left by a failed rollback must remain recoverable.
export async function withPackageStaging(parent, build) {
  const staging = await mkdtemp(path.join(parent, 'package-'));
  try {
    return await build(staging);
  } finally {
    const rollback = await lstat(path.join(staging, '.previous.app')).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!rollback) await rm(staging, { recursive: true, force: true });
  }
}
