import { Chunk } from '../types';
import { createPublicPromise, PublicPromise } from '../helper';
import { MSE } from './mse';
import { Transmuxer } from './transmuxer';

interface Task {
  chunk: Required<Chunk>;
  p: PublicPromise<void>
}

export class MediaEngine {
  private tasks: Task[] = [];

  private mse: MSE;

  private transmuxer: Transmuxer;

  private crypto: Crypto;

  constructor() {
    this.mse = new MSE();
  }

  configure(data: Uint8Array, videoCodec: string): void {
    if (Transmuxer.isTsOrFlv(data)) return;
  }

  push(videoChunk?: Chunk, audioChunk?: Chunk) {
    if (!videoChunk || !videoChunk.data || !videoChunk.data.length) return;
    const p = createPublicPromise();

    this.tasks.push({ chunk: videoChunk, p } as Task);

    if (this.tasks.length === 1) {
      this.process(this.tasks.shift() as Task);
    }

    return p;
  }

  private async process({ chunk, p }: Task) {
    let data = chunk.data;
    if (chunk.key) {
      data = await this.crypto.decrypt(chunk);
    }

    await this.transmuxer.trans(data);
    return this.mse.appendBuffer(data);
  }
}
