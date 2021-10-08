import {
  Loader, ResponseType, RequestError, RequestStats, LoadResponse, LoadResult, LoadOptions,
} from './types';
import { getRangeValue } from './helper';

function responseToLoadResponse(response: Response): LoadResponse {
  (response as unknown as LoadResponse).headers = [...response.headers.entries()].reduce((a, c) => {
    a[c[0]] = c[1];
    return a;
  }, Object.create(null));

  return response as unknown as LoadResponse;
}

export class FetchLoader implements Loader {
  private abortController?: AbortController;

  private stats?: RequestStats;

  private timeoutTimer?: NodeJS.Timeout;

  load({
    url,
    timeout,
    responseType,
    range,
    responseFilter,
    onProgress,
    onTimeout,
    ...init
  }: LoadOptions): Promise<void | LoadResult> {
    clearTimeout(this.timeoutTimer!);

    this.abortController = new AbortController();
    const stats = this.stats = new RequestStats();
    init.signal = this.abortController.signal;

    if (timeout != null) {
      this.timeoutTimer = setTimeout(() => {
        this.cancel();
        if (onTimeout) onTimeout();
      }, timeout);
    }

    const rangeValue = getRangeValue(range);
    if (rangeValue) {
      const headers = init.headers || {};
      if (headers instanceof Headers) {
        headers.append('Range', rangeValue);
      } else {
        headers.Range = rangeValue;
      }
    }

    const startTime = performance.now();
    return fetch(url, init).then(async (res) => {
      stats.loadTime = performance.now() - startTime;

      clearTimeout(this.timeoutTimer!);

      let response = responseToLoadResponse(res);
      if (responseFilter) {
        response = responseFilter(response) || response;
      }

      if (!response.ok) {
        throw new RequestError('Bad network response', stats, response);
      }

      let data: LoadResult['data'];
      if (responseType === ResponseType.TEXT) {
        data = await res.text();
      } else if (responseType === ResponseType.JSON) {
        data = await res.json();
      } else {
        if (onProgress) {
          await this.loadChunk(res.clone(), onProgress);
        }
        data = new Uint8Array(await res.arrayBuffer());
      }

      return {
        data,
        response,
        stats,
        contentLength: parseInt(response.headers['content-length'] || '0', 10),
        age: response.headers.age != null ? parseFloat(response.headers.age) : undefined,
      };
    }).catch((error) => {
      clearTimeout(this.timeoutTimer!);
      if (stats.aborted) return;

      if (error instanceof RequestError) throw error;
      throw new RequestError(error, stats, error.response);
    });
  }

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      if (this.stats) this.stats.aborted = true;
    }
  }

  private loadChunk(response: Response, onProgress: LoadOptions['onProgress']) {
    const reader = response.body!.getReader();
    let data;

    const pump = async () => {
      try {
        data = await reader.read();
      } catch (e) {
        // request aborted
        return;
      }
      onProgress!(data.value, data.done, response);
      if (!data.done) pump();
    };

    pump();
  }

  static isSupported(): boolean {
    if (typeof ReadableStream !== 'undefined') {
      try {
        new ReadableStream({}); // eslint-disable-line no-new
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }
    return !!(typeof fetch !== 'undefined' && typeof AbortController !== 'undefined');
  }
}
