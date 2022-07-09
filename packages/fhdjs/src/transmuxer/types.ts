import { VideoTrack, AudioTrack } from './domain';

export interface DemuxerResult {
  videoTrack: VideoTrack;
  audioTrack: AudioTrack;
}

export interface Demuxer {
  readonly videoTrack: VideoTrack;
  readonly audioTrack: AudioTrack;
  demux(data: Uint8Array, discontinuity?: boolean, contiguous?: boolean, startTime?: number): DemuxerResult;
}

export interface Remuxer {
  remux(): void;
}

export interface SPSInfo {
  codec: string;
  width: number;
  height: number;
  sarRatio: [number, number];
}

export interface DecoderConfigurationRecordResult {
  sps?: SPSInfo;
  spsList: Uint8Array[];
  ppsList: Uint8Array[];
  vpsList?: Uint8Array[];
  nalUnitSize: number;
}
