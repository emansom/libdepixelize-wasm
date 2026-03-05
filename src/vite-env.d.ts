/// <reference types="vite/client" />

declare module '*.wasm' {
  const url: string;
  export default url;
}

declare module '*?worker&url' {
  const url: string;
  export default url;
}

