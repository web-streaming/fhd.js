export enum StreamType {
  VIDEO = 'video',
  AUDIO = 'audio'
}

export interface Url {
  url: string;

  range?: [number, number];
}

export interface SegmentKey {
  url?: string;

  data?: Uint8Array;

  iv?: Uint8Array;
}

export interface InitSegment extends Url {
  key?: SegmentKey;
}

export interface SegmentPart extends Url {
  last?: boolean;
}

export interface Segment extends Partial<Url> {
  start: number;

  end: number;

  sn: number;

  cc: any;

  key?: SegmentKey

  wallClockTime?: number;

  invalid?: boolean;

  last?: boolean;
}

export interface Stream {
  type: StreamType;

  url?: string;

  bitrate?: number;

  codecs?: string;

  label?: string;

  mimeType?: string;

  default?: boolean;

  lang?: string;
}

export interface VideoStream extends Stream {
  width?: number;

  height?: number;

  fps?: number;

  sar?: [number, number];
}

export interface AudioStream extends Stream {
  channels?: number;

  samplingRate?: number;
}

export interface Rendition {
  live: boolean;

  chunked?: boolean;

  dvrWindow?: number;

  latency?: number;

  maxLatency?: number;

  minLatency?: number;

  minPlaybackRate?: number;

  maxPlaybackRate?: number;

  maxSegmentDuration?: number;

  videoStreams: VideoStream[];

  audioStreams: AudioStream[];
}

export enum StreamingType {
  FLV = 'flv',
  HLS = 'hls',
  DASH = 'dash'
}

export interface FullSegment {
  video?: Segment;
  audio?: Segment;
}

export interface Manifestor {
  rendition: Rendition;

  parse(text: string, url: string): Promise<Rendition>;

  selectVideoStream(index: number): Promise<void>;

  selectAudioStream(index: number): Promise<void>;

  getLiveEdgeSegment(delay?: number): FullSegment;

  getSegmentByTime(time?: number): FullSegment;

  getNextSegment(segment: FullSegment): FullSegment;

  getInitSegment(segment?: Segment): InitSegment | void;

  getSegmentPart(segment: Segment, index: number): Promise<SegmentPart | undefined>;

  getSegmentBySn(sn: number): Segment;
}

export interface Chunk {
  data?: Uint8Array;
  key?: Uint8Array;
  iv?: Uint8Array;
}
