import {
  Stream, VideoStream, AudioStream, StreamType,
} from '../streaming';
import { SegmentFinder } from './types';

export abstract class DashStream implements Stream {
  abstract type: StreamType;

  bitrate = 0;

  label = '';

  lang = '';

  default = false;

  mimeType = '';

  codecs = '';

  periodId = '';

  periodStart = 0;

  periodEnd = 0;

  representationId = '';

  segmentFinder: SegmentFinder;

  constructor(segmentFinder: SegmentFinder) {
    this.segmentFinder = segmentFinder;
  }

  update(prevStream?: DashStream) {

  }
}

export class DashVideoStream extends DashStream implements VideoStream {
  type = StreamType.VIDEO;

  width = 0;

  height = 0;

  fps = 0;

  sar?: [number, number];
}

export class DashAudioStream extends DashStream implements AudioStream {
  type = StreamType.AUDIO;

  channels = 0;

  samplingRate = 0;
}

export abstract class CombinedStream<T extends DashStream> implements Stream {
  constructor(private streams: T[]) {
    this.streams = streams;
  }

  get firstStream() {
    return this.streams[0];
  }

  get type() {
    return this.firstStream.type;
  }

  get bitrate() {
    return this.firstStream.bitrate;
  }

  get lang() {
    return this.firstStream.lang;
  }

  get default() {
    return this.firstStream.default;
  }

  get mimeType() {
    return this.firstStream.mimeType;
  }

  get codecs() {
    return this.firstStream.codecs;
  }

  get label() {
    return this.firstStream.label;
  }
}

export class CombinedVideoStream extends CombinedStream<DashVideoStream> implements VideoStream {
  get width() {
    return this.firstStream.width;
  }

  get height() {
    return this.firstStream.height;
  }

  get fps() {
    return this.firstStream.fps;
  }

  get sar() {
    return this.firstStream.sar;
  }
}

export class CombinedAudioStream extends CombinedStream<DashAudioStream> implements AudioStream {
  get channels() {
    return this.firstStream.channels;
  }

  get samplingRate() {
    return this.firstStream.samplingRate;
  }
}
