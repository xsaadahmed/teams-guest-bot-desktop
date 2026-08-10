declare module '../build/appPaths' {
  export function initAppPaths(root: string): void;
}

declare module '../build/resources' {
  export function initPackagedResources(resourcesPath: string): void;
}

declare module '../build/server' {
  export interface StartServerOptions {
    openWebUi?: boolean;
  }
  export function startServer(options?: StartServerOptions): Promise<{ port: number }>;
}
