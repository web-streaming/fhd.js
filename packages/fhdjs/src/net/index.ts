import { FetchLoader } from './fetch';
import { XhrLoader } from './xhr';
import {
  LoaderType, ResponseType, NetLoaderOptions, LoaderClass, Loader, LoadResult,
} from './types';

export {
  FetchLoader,
  XhrLoader,
  LoaderType,
  ResponseType,
};

export class NetLoader<T = Uint8Array> {
  type = LoaderType.FETCH;

  retryCount = 0;

  loading = false;

  loader: Loader;

  private canceled = false;

  private retryTimer?: NodeJS.Timeout;

  private opts: Partial<NetLoaderOptions>;

  constructor(opts?: Partial<NetLoaderOptions>) {
    this.opts = opts || {};

    let LoaderCls: LoaderClass = FetchLoader;

    if (this.opts.loader) {
      LoaderCls = this.opts.loader;
      this.type = LoaderType.CUSTOM;
    } else if (this.opts.loaderType === LoaderType.XHR
      || !FetchLoader.isSupported()) {
      LoaderCls = XhrLoader;
      this.type = LoaderType.XHR;
    }

    this.loader = new LoaderCls();
  }

  isFetch() {
    return this.type === LoaderType.FETCH;
  }

  static isFetchSupport() {
    return FetchLoader.isSupported();
  }

  load(url: string | NetLoaderOptions, config?: NetLoaderOptions): Promise<void | (Omit<LoadResult, 'data'> & { data: T })> {
    if (this.loading) return Promise.resolve();

    if (typeof url === 'string') {
      config = { url };
    } else {
      config = url;
    }

    config = { ...config, ...this.opts };

    if (config.requestFilter) {
      config = config.requestFilter(config) || config;
    }

    let {
      retry,
      retryDelay,
      // eslint-disable-next-line prefer-const
      onRetryFailed,
      // eslint-disable-next-line prefer-const
      ...rest
    } = config;

    retry = retry || 0;
    retryDelay = retryDelay || 0;

    this.retryCount = 0;
    this.canceled = false;
    this.loading = true;

    return new Promise((resolve, reject) => {
      const request = async () => {
        try {
          const response = await this.loader.load(rest);
          this.loading = false;
          resolve(response as any);
        } catch (error) {
          if (this.canceled) return;

          this.retryCount++;
          if (onRetryFailed) onRetryFailed(error as any, this.retryCount);

          if (this.retryCount <= retry!) {
            clearTimeout(this.retryTimer!);
            this.retryTimer = setTimeout(request, retryDelay);
            return;
          }

          this.loading = false;
          reject(error);
        }
      };

      request();
    });
  }

  cancel(): void {
    clearTimeout(this.retryTimer!);
    this.loader.cancel();
    this.canceled = true;
    this.loading = false;
  }
}
