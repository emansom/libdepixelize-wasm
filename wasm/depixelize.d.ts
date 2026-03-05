interface DepixelizeModuleOptions {
  wasmBinary?: ArrayBuffer | Uint8Array;
  locateFile?: (path: string, prefix: string) => string;
}

declare function createDepixelizeModule(options?: DepixelizeModuleOptions): Promise<Record<string, unknown>>;
export default createDepixelizeModule;
