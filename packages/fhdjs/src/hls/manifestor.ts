import { binarySearch } from '../utils';
import { NetLoader, ResponseType } from '../net';
import { M3U8Parser } from './parser';
import { HlsRendition } from './rendition';
import { HlsSegment } from './segment';
import { HlsStream } from './stream';

export class HlsManifestor {
  rendition = new HlsRendition();

  currentStream?: HlsStream;

  private m3u8Loader?: NetLoader<string>;

  private refreshTimer?: NodeJS.Timeout;

  load(text: string, url: string, loadTime: number): void | never {
    if (!M3U8Parser.parse(text, url, this.rendition)) {
      throw new Error(`M3U8 parse error: ${text}`);
    }

    const rendition = this.rendition;
    rendition.streams.forEach((stream) => {
      stream.updatedAt = loadTime;
    });
  }

  async switchStream(index: number): Promise<void | never> {
    const stream = this.currentStream = this.rendition.streams[index];
    if (!stream) throw new Error(`index: ${index} stream is undefined`);
    if (stream.segments.length && !this.rendition.dynamic) return;

    if (this.m3u8Loader) {
      this.m3u8Loader.cancel();
    } else {
      this.m3u8Loader = new NetLoader<string>({ responseType: ResponseType.TEXT });
    }

    const res = await this.m3u8Loader.load(stream.url!);
    if (!res) return;

    M3U8Parser.parse(res.data, stream.url!, this.rendition, stream);

    if (this.rendition.dynamic) {
      if (this.rendition.llhls) {
        //
      }

      this.refreshTimer = setTimeout(this.refreshPlaylist, this.rendition.segmentDuration);
    }
  }

  getLiveEdgeSegment(delay?: number): HlsSegment | void {
    if (!this.currentStream) return;
    const lastSegment = this.currentStream.lastSegment;
    const updatedAt = this.currentStream.updatedAt;
    if (!lastSegment || !delay || (!updatedAt && !lastSegment.wallClockTime)) return lastSegment;
    const segments = this.currentStream.segments;
    const expectedWallClockTime = Date.now() - delay * 1000;

    for (let i = segments.length - 1; i >= 0; i--) {
      if (expectedWallClockTime >= (segments[i].wallClockTime || (updatedAt! - segments[i].duration * 1000))) {
        return segments[i];
      }
    }

    return segments[0];
  }

  getSegmentByTime(time: number): HlsSegment | void {
    const segments = this.currentStream?.segments;
    if (!segments || !segments.length || time == null) return;
    if (time >= segments[segments.length - 1].start) return segments[segments.length - 1];
    if (time < segments[0].end) return segments[0];
    return binarySearch(segments, (seg) => {
      if (seg.start > time) return -1;
      if (seg.end <= time) return 1;
      return 0;
    });
  }

  getSegmentBySn(sn: number): HlsSegment | void {
    const segments = this.currentStream?.segments;
    if (!segments || !segments.length || sn == null) return;
    return binarySearch(segments, (seg) => {
      if (seg.sn > sn) return -1;
      if (seg.sn < sn) return 1;
      return 0;
    });
  }

  private refreshPlaylist = async () => {
    const stream = this.currentStream;
    if (!stream || !this.m3u8Loader || this.m3u8Loader.loading) return;
    clearTimeout(this.refreshTimer!);

    try {
      const res = await this.m3u8Loader.load(stream.url!);
      if (!res) return;
      M3U8Parser.parse(res.data, stream.url!, this.rendition, stream);
    } catch (error) {
      // TODO
    }

    this.refreshTimer = setTimeout(this.refreshPlaylist, this.rendition.segmentDuration);
  }
}
