import {
  Manifestor, Segment, SegmentPart, Chunk,
} from './types';
import { NetLoader } from '../net';
import { LRU } from '../utils';

export class Loader {
  private keyLru: LRU<Uint8Array>;

  private initLru: LRU<Uint8Array>;

  private initLoader: NetLoader<Uint8Array>;

  private keyLoader: NetLoader<Uint8Array>;

  private segmentLoader: NetLoader<Uint8Array>;

  private lastSegment?: Segment;

  constructor(keyCacheSize = 5, initCacheSize = 5) {
    this.keyLru = new LRU<Uint8Array>(keyCacheSize);
    this.initLru = new LRU<Uint8Array>(initCacheSize);

    this.initLoader = new NetLoader();
    this.keyLoader = new NetLoader();
    this.segmentLoader = new NetLoader();
  }

  async loadSegment(
    seg: Segment,
    manifestor: Manifestor,
    onProgress: (chunk?: Chunk, done?: boolean) => void,
  ) {
    const end = () => onProgress(undefined, true);

    if (!this.lastSegment || this.lastSegment.cc !== seg.cc) {
      const toLoad = [];
      let initData;
      let keyData;

      const initSegment = manifestor.getInitSegment(seg);
      if (initSegment) {
        initData = this.initLru.get(initSegment.url);
        if (!initData) {
          toLoad[0] = this.initLoader.load({
            url: initSegment.url,
            range: initSegment.range,
          });
        }
        const key = initSegment.key;
        if (key) {
          if (key.url) {
            keyData = this.keyLru.get(key.url);
            if (!keyData) {
              toLoad[1] = this.keyLoader.load(key.url);
            }
          } else {
            keyData = key.data;
          }
        }

        if (toLoad.length) {
          const [initRes, keyRes] = await Promise.all(toLoad);
          if (!initRes && !keyRes) return end();
          if (initRes) {
            initData = initRes.data;
            this.initLru.set(initSegment.url, initData);
          }
          if (keyRes) {
            keyData = keyRes.data;
            this.keyLru.set(key!.url, keyData);
          }
        }

        onProgress({ data: initData, key: keyData, iv: key?.iv }, false);
      }
    }

    let key: undefined | Uint8Array;
    let iv: undefined | Uint8Array;
    if (seg.key) {
      iv = seg.key.iv;
      const url = seg.key.url;
      if (seg.key.data) {
        key = seg.key.data;
      } else if (url) {
        key = this.keyLru.get(url);
        if (!key) {
          const keyRes = await this.keyLoader.load(url);
          if (!keyRes) return end();
          key = keyRes.data;
          this.keyLru.set(url, key);
        }
      }
    }

    if (seg.url) {
      const { chunked } = manifestor.rendition;
      const res = await this.segmentLoader.load({
        url: seg.url,
        range: seg.range,
        onProgress: chunked ? (data, done) => onProgress({ key, iv, data }, done) : undefined,
      });
      if (chunked) return;
      onProgress(res ? { key, iv, data: res.data } : undefined, true);
    } else {
      let part: SegmentPart | undefined;

      const load = async (index: number): Promise<any> => {
        part = await manifestor.getSegmentPart(seg, index);
        if (!part) return end();
        const res = await this.segmentLoader.load({ url: part.url, range: part.range });
        if (!res) return end();
        onProgress({ data: res.data, key, iv }, part.last);
        if (!part.last) return load(index + 1);
      };

      await load(0);
    }
  }
}
