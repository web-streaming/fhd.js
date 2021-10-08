export enum LoaderType {
  FETCH = 'fetch',
  XHR = 'xhr',
  CUSTOM = 'custom'
}

export enum ResponseType {
  ARRAY_BUFFER = 'arraybuffer',
  TEXT = 'text',
  JSON = 'json'
}

export class RequestStats {
  aborted = false;

  loadTime = 0;
}

export interface LoadOptions extends RequestInit {
  url: string;
  timeout?: number;
  responseType?: ResponseType;
  method?: string;
  headers?: Record<string, string>;
  credentials?: 'omit' |'same-origin' | 'include';
  range?: [number, number];
  body?: XMLHttpRequestBodyInit;

  responseFilter?: (res: LoadResponse) => LoadResponse | void;
  onProgress?: (data: Uint8Array | undefined, done: boolean, response?: Response | LoadResponse) => void;
  onTimeout?: () => void;
}

export interface LoadResponse extends Partial<Omit<Omit<Response, 'body'>, 'headers'>> {
  ok: boolean;
  status: number;
  statusText: string;
  url: string,
  headers: Record<string, string>;
}

export interface LoadResult {
  response: LoadResponse;
  stats: RequestStats;
  data: string | Object | Uint8Array;
  contentLength?: number;
  age?: number;
}

export interface Loader {
  load(opts: LoadOptions): Promise<LoadResult | void>;
  cancel(): void;
}

export interface LoaderClass {
  new (...args: any[]): Loader;
}

export class RequestError extends Error {
  constructor(message: string, readonly stats: RequestStats, readonly response?: LoadResponse) {
    super(message);
    this.response = response;
    this.stats = stats;
  }
}

export interface NetLoaderOptions extends LoadOptions {
  loaderType?: LoaderType;
  retry?: number;
  retryDelay?: number;
  loader?: LoaderClass;
  onRetryFailed?: (error: RequestError | Error | undefined, retryCount: number) => void;
  requestFilter?: (opts: NetLoaderOptions) => void | NetLoaderOptions;
}
