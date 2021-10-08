import { createPublicPromise, PublicPromise, Buffer } from './helper';

type MimeSourceBuffer = SourceBuffer & { mimeType: string }

export class MSE {
  mediaSource: MediaSource;

  sourceBuffer: Record<string, MimeSourceBuffer> = Object.create(null)

  private openPromise = createPublicPromise()

  private queue: Record<string, { promise: PublicPromise; exec: () => void }[]> = Object.create(null)

  constructor(public media: HTMLMediaElement, MS?: typeof MediaSource) {
    MS = MS || MediaSource || (window as any).WebKitMediaSource;

    this.media = media;
    const ms = this.mediaSource = new MS();
    media.src = URL.createObjectURL(ms);

    const onOpen = () => {
      ms.removeEventListener('sourceopen', onOpen);
      URL.revokeObjectURL(media.src);
      this.openPromise.resolve();
    };

    ms.addEventListener('sourceopen', onOpen);
  }

  get duration(): number {
    return this.mediaSource.duration || 0;
  }

  updateDuration(duration: number): Promise<void> {
    return this.enqueueBlockingOp(() => {
      this.mediaSource.duration = duration;
    });
  }

  open(): Promise<void> {
    return this.openPromise;
  }

  createSource(type: string, mimeType: string): boolean {
    if (!type || !mimeType || this.sourceBuffer[type]) return false;
    const sb = this.sourceBuffer[type] = this.mediaSource.addSourceBuffer(mimeType) as MimeSourceBuffer;
    sb.mimeType = mimeType;
    sb.addEventListener('updateend', this.onSBUpdateEnd.bind(this, type));
    sb.addEventListener('error', this.onSBUpdateError.bind(this, type));
    return true;
  }

  changeType(type: string, mimeType: string): Promise<void> {
    const sb = this.sourceBuffer[type];
    if (sb && sb.mimeType !== mimeType) {
      return this.enqueueOp(type, () => {
        sb.changeType(mimeType);
      });
    }
    return Promise.resolve();
  }

  createOrChangeSource(type: string, mimeType: string): Promise<void> {
    this.createSource(type, mimeType);
    return this.changeType(type, mimeType);
  }

  append(type: string, buffer: BufferSource): Promise<void> {
    if (!buffer || !buffer.byteLength) {
      return Promise.resolve();
    }
    return this.enqueueOp(type, () => {
      this.sourceBuffer[type].appendBuffer(buffer);
    });
  }

  remove(type: string, startTime: number, endTime: number): Promise<void> {
    return this.enqueueOp(type, () => {
      const sb = this.sourceBuffer[type];
      if (startTime >= endTime || !sb) {
        this.onSBUpdateEnd(type);
        return;
      }

      sb.remove(startTime, endTime);
    });
  }

  endOfStream(reason: EndOfStreamError): Promise<void> {
    if (!this.mediaSource || this.mediaSource.readyState !== 'open') return Promise.resolve();
    return this.enqueueBlockingOp(() => {
      const ms = this.mediaSource;
      if (!ms || ms.readyState !== 'open') return;
      if (reason) {
        ms.endOfStream(reason);
      } else {
        ms.endOfStream();
      }
    });
  }

  buffered(type: string): TimeRanges | undefined {
    return Buffer.get(this.sourceBuffer[type]);
  }

  bufferStart(type: string) {
    return Buffer.start(this.buffered(type));
  }

  bufferEnd(type: string) {
    return Buffer.end(this.buffered(type));
  }

  async destroy(): Promise<void> {
    const ms = this.mediaSource;
    if (ms) {
      const waiters: Promise<any>[] = [];

      Object.keys(this.queue).forEach((t) => {
        const queue = this.queue[t];
        const op = queue.shift();
        if (op) {
          waiters.push(op.promise.catch(() => {}));
          queue.forEach((x) => x.promise.reject(new Error('canceled')));
        }
      });

      await Promise.all(waiters);

      if (ms.readyState === 'open') {
        try {
          ms.endOfStream();
        } catch (error) {
          // ignore
        }
      }

      for (let i = 0, l = ms.sourceBuffers.length; i < l; i++) {
        try {
          ms.removeSourceBuffer(ms.sourceBuffers[i]);
        } catch (error) {
          // ignore
        }
      }

      this.mediaSource = null!;
    }

    if (this.media) {
      this.media.removeAttribute('src');
      this.media.load();
      this.media = null!;
    }

    this.queue = Object.create(null);
    this.sourceBuffer = Object.create(null);
  }

  private enqueueOp(type: string, exec: () => void): Promise<void> {
    const queue = this.queue[type] = this.queue[type] || [];
    const op = {
      exec,
      promise: createPublicPromise(),
    };

    queue.push(op);

    if (queue.length === 1) {
      this.startQueue(type);
    }

    return op.promise;
  }

  private async enqueueBlockingOp(exec: () => void): Promise<void> {
    const types = Object.keys(this.sourceBuffer);
    if (!types.length) {
      exec();
      return Promise.resolve();
    }

    const waiters: Promise<any>[] = [];
    types.forEach((t) => {
      const queue = this.queue[t];
      const prom = createPublicPromise();
      waiters.push(prom);
      queue.push({ exec: () => prom.resolve(), promise: prom });
      if (queue.length === 1) {
        this.startQueue(t);
      }
    });

    return Promise.all(waiters).then(() => {
      try {
        exec();
      } finally {
        types.forEach((t) => {
          const queue = this.queue[t];
          const sb = this.sourceBuffer[t];
          queue.shift();
          if (!sb || !sb.updating) {
            this.startQueue(t);
          }
        });
      }
    });
  }

  private startQueue(type: string): void {
    const queue = this.queue[type];
    if (queue) {
      const op = queue[0];
      if (op) {
        try {
          op.exec();
        } catch (error) {
          op.promise.reject(error);
          queue.shift();
          this.startQueue(type);
        }
      }
    }
  }

  private onSBUpdateEnd = (type: string): void => {
    const queue = this.queue[type];
    if (queue) {
      const op = queue.shift();
      if (op) {
        op.promise.resolve();
        this.startQueue(type);
      }
    }
  }

  private onSBUpdateError = (type: string, event: Event): void => {
    const queue = this.queue[type];
    if (queue) {
      const op = queue[0];
      if (op) {
        op.promise.reject(event);
        // Do not shift from queue, 'updateend' event will fire next
      }
    }
  }

  static isSupported() {
    if (!MediaSource) return false;
    try {
      return MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
    } catch (error) {
      return false;
    }
  }
}
