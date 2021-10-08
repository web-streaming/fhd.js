import {
  RequestError, RequestStats, Loader, LoadResponse, LoadResult, LoadOptions,
} from './types';
import { getRangeValue } from './helper';

function getHeader(xhr: XMLHttpRequest): LoadResponse['headers'] {
  const headerLines = xhr.getAllResponseHeaders().trim().split('\r\n');
  return headerLines.reduce((a, c) => {
    const parts = c.split(': ');
    a[parts[0].toLowerCase()] = parts.slice(1).join(': ');
    return a;
  }, Object.create(null));
}

export class XhrLoader implements Loader {
  private xhr?: XMLHttpRequest;

  private stats?: RequestStats;

  private timeoutTimer?: NodeJS.Timeout;

  load({
    url,
    timeout,
    method,
    responseType,
    responseFilter,
    onProgress,
    onTimeout,
    credentials,
    body,
    headers,
    range,
  }: LoadOptions): Promise<void | LoadResult> {
    clearTimeout(this.timeoutTimer!);

    const stats = this.stats = new RequestStats();

    return new Promise<void | LoadResult>((resolve, reject) => {
      const xhr = this.xhr = new XMLHttpRequest();
      xhr.open(method || 'GET', url, true);
      xhr.responseType = responseType || 'arraybuffer';
      xhr.withCredentials = credentials === 'include' || credentials === 'same-origin';
      if (headers) {
        Object.keys(headers).forEach((k) => {
          xhr.setRequestHeader(k, headers[k]);
        });
      }

      const rangeValue = getRangeValue(range);
      if (rangeValue) {
        xhr.setRequestHeader('range', rangeValue);
      }

      if (timeout != null) {
        this.timeoutTimer = setTimeout(() => {
          this.cancel();
          if (onTimeout) onTimeout();
        }, timeout);
      }

      xhr.onerror = (event) => reject(event);

      const startTime = performance.now();

      xhr.onreadystatechange = () => {
        if (xhr.readyState >= 2) {
          clearTimeout(this.timeoutTimer!);

          if (!stats.loadTime) {
            stats.loadTime = performance.now() - startTime;
          }

          if (xhr.readyState === 4) {
            xhr.onreadystatechange = null;

            const status = xhr.status;
            let response = {
              ok: status >= 200 && status < 300,
              status,
              statusText: xhr.statusText,
              url,
              headers: getHeader(xhr),
            };

            if (responseFilter) {
              response = responseFilter(response) || response;
            }

            if (!response.ok) {
              return new RequestError('bad network response', stats, response);
            }

            const isArraybuffer = xhr.responseType === 'arraybuffer';
            const data = isArraybuffer ? new Uint8Array(xhr.response) : xhr.response;

            if (onProgress) {
              onProgress(isArraybuffer ? data : new Uint8Array(), true, response);
            }

            resolve({
              data: isArraybuffer ? data : xhr.response,
              response,
              stats,
              contentLength: parseInt(response.headers['content-length'] || '0', 10),
              age: response.headers.age != null ? parseFloat(response.headers.age) : undefined,
            });
          }
        }
      };

      xhr.send(body);
    }).catch((error) => {
      clearTimeout(this.timeoutTimer!);
      if (stats.aborted) return;

      if (error instanceof RequestError) throw error;
      throw new RequestError(error, stats, error.response);
    });
  }

  cancel() {
    if (this.xhr) {
      this.xhr.abort();
      if (this.stats) this.stats.aborted = true;
    }
  }

  static isSupported() {
    return typeof XMLHttpRequest !== 'undefined';
  }
}
