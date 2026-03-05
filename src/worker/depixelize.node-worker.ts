import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import createDepixelizeModule from '../../wasm/depixelize.js';
import { setupWorker } from './depixelize.worker-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

setupWorker(
  () => readFile(join(__dirname, '..', '..', 'wasm', 'depixelize.wasm')),
  (opts) => createDepixelizeModule(opts),
  (msg) => parentPort!.postMessage(msg),
  (handler) => {
    parentPort!.on('message', handler);
  },
);
