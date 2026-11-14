import { parentPort, workerData } from 'node:worker_threads';
import { parseLibraryFile } from './library-parser.mjs';

try { parentPort.postMessage({ result: await parseLibraryFile(workerData.name, workerData.bytes) }); }
catch (error) { parentPort.postMessage({ error: { message: error.message, code: error.code } }); }
