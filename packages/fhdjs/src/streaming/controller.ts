import { Player } from '../player';
import { NetLoader, ResponseType } from '../net';
import { Manifestor, FullSegment, Chunk } from './types';
import { getUrlExt } from '../utils';
import { MediaEngine } from './media-engine';
import { Loader } from './loader';

export class Controller {
  private mediaEngine!: MediaEngine;

  private manifestLoader = new NetLoader<string>({ responseType: ResponseType.TEXT })

  private manifestor?: Manifestor;

  private videoLoader: Loader;

  private audioLoader: Loader;

  private loading = false;

  constructor(public player: Player) {
    this.player = player;
    this.videoLoader = new Loader();
    this.audioLoader = new Loader();
  }

  async load(url: string) {
    const res = await this.manifestLoader.load(url);

    if (!res) return;

    const player = this.player;
    const manifestor = this.manifestor = player.getManifestorByMime(res.contentType) || player.getManifestorByExt(getUrlExt(url));

    if (!manifestor) throw new Error('');

    const rendition = await manifestor.parse(res.data, url);

    const segment = rendition.live ? manifestor.getLiveEdgeSegment() : manifestor.getSegmentByTime();
    this.loadSegment(segment);
  }

  async loadSegment(fullSegment?: FullSegment) {
    if (!this.manifestor || !fullSegment || this.loading || !this.canLoad()) return;
    const { manifestor } = this;

    this.loading = true;
    const videoChunks: Chunk[] = [];
    const audioChunks: Chunk[] = [];
    const p = [];

    const pushChunk = (arr: Chunk[], chunk?: Chunk) => {
      if (!chunk) return;
      if (fullSegment.video && fullSegment.audio) {
        arr.push(chunk);
        if (videoChunks.length === audioChunks.length) {
          this.onProgress(videoChunks.shift(), audioChunks.shift());
        }
      } else {
        this.onProgress(chunk);
      }
    };
    if (fullSegment.video) p.push(this.videoLoader.loadSegment(fullSegment.video, manifestor, (c) => pushChunk(videoChunks, c)));
    if (fullSegment.audio) p.push(this.audioLoader.loadSegment(fullSegment.audio, manifestor, (c) => pushChunk(audioChunks, c)));
    await Promise.all(p);
    this.loading = false;
    this.loadSegment(manifestor.getNextSegment(fullSegment));
  }

  private onProgress = (videoChunk?: Chunk, audioChunk?: Chunk) => {
    this.mediaEngine.push(videoChunk, audioChunk);
  }

  private canLoad(): boolean {
    return true;
  }
}
