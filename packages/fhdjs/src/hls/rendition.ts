import { AudioStream, Rendition, VideoStream } from '../streaming';
import { HlsStream } from './stream';

export class HlsRendition implements Rendition {
  live = true;

  dvrWindow?: number | undefined;

  latency?: number | undefined;

  maxLatency?: number | undefined;

  minLatency?: number | undefined;

  minPlaybackRate?: number | undefined;

  maxPlaybackRate?: number | undefined;

  maxSegmentDuration?: number | undefined;

  videoStreams: VideoStream[] =[];

  audioStreams: AudioStream[] = [];

  start = 0;

  startPrecise?: boolean;

  segmentDuration?: number;

  delay?: number;

  lhls = false;

  llhls = false;

  streams: HlsStream[] = [];
}
