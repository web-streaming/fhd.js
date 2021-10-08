import { VideoSample } from './video-sample';
import { TrackType, VideoCodecType } from './types';

export class VideoTrack {
  readonly id = 1;

  readonly type: TrackType = TrackType.VIDEO

  codecType: VideoCodecType = VideoCodecType.AVC;

  pid = -1;

  sequenceNumber = 0;

  dropped = 0;

  timescale = 0;

  baseMediaDecodeTime = 0;

  duration = 0;

  samples: VideoSample[] = [];

  pps: Uint8Array[] = [];

  sps: Uint8Array[] = [];

  vps: Uint8Array[] = [];

  codec = '';

  width = 0;

  height = 0;

  nalUnitSize = 4;

  sarRatio?: [number, number];

  get sampleSize(): number {
    return this.samples.length;
  }

  exist(): boolean {
    return !!(this.pps.length && this.sps.length);
  }

  reset(): void {
    this.pid = -1;
    this.sequenceNumber = this.dropped = this.timescale = this.baseMediaDecodeTime = this.duration = this.width = this.height = 0;
    this.pps = [];
    this.sps = [];
    this.vps = [];
    this.samples = [];
  }
}
