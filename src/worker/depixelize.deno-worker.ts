// @ts-nocheck — Deno worker: only compiled by tsconfig.deno.json or Deno runtime
import createDepixelizeModule from '../../wasm/depixelize.js';
import { setupWorker } from './depixelize.worker-core.js';

declare const Deno: {
  readFile(path: string | URL): Promise<Uint8Array>;
};

setupWorker(
  () => Deno.readFile(new URL('../../wasm/depixelize.wasm', import.meta.url)),
  (opts) => createDepixelizeModule(opts),
  (msg) => self.postMessage(msg),
  (handler) => {
    self.onmessage = (e: MessageEvent) => handler(e.data);
  },
);
