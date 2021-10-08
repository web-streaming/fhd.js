export { Buffer } from './buffer';

export interface PublicPromise<T = any> extends Promise<T> {
  resolve: (value?: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export function createPublicPromise<T = any>(): PublicPromise<T> {
  let res;
  let rej;

  const promise = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  }) as any;
  promise.resolve = res;
  promise.reject = rej;

  return promise as PublicPromise<T>;
}
