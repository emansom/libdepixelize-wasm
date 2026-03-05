import type { DepixelizeOptions, DepixelizeResult } from '../types.js';
import type { DepixelizeModule } from '../core.js';
import { depixelizeCore } from '../core.js';

export interface WorkerMessage {
  id: number;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  options?: Partial<DepixelizeOptions>;
}

export interface WorkerResponse {
  type?: 'ready';
  id?: number;
  result?: DepixelizeResult;
  error?: string;
}

export async function setupWorker(
  loadWasm: () => Promise<Uint8Array | ArrayBuffer>,
  createModule: (opts: { wasmBinary: Uint8Array | ArrayBuffer }) => Promise<unknown>,
  sendMessage: (msg: WorkerResponse) => void,
  onMessage: (handler: (msg: WorkerMessage) => void) => void,
): Promise<void> {
  const mod = (await createModule({
    wasmBinary: await loadWasm(),
  })) as unknown as DepixelizeModule;

  sendMessage({ type: 'ready' });

  onMessage(async (msg) => {
    try {
      const pixels = new Uint8Array(msg.pixels);
      const result = depixelizeCore(mod, pixels, msg.width, msg.height, msg.options);
      sendMessage({ id: msg.id, result });
    } catch (e) {
      sendMessage({ id: msg.id, error: (e as Error).message });
    }
  });
}
