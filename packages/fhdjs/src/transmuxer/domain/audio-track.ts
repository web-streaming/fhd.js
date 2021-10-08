import { AudioSample } from './audio-sample';
import { TrackType, AudioCodecType } from './types';

export class AudioTrack {
  readonly id = 2;

  readonly type: TrackType = TrackType.AUDIO;

  codecType: AudioCodecType = AudioCodecType.AAC;

  pid = -1;

  sequenceNumber = 0;

  timescale = 0;

  baseMediaDecodeTime = 0;

  duration = 0;

  dropped = 0;

  inserted = 0;

  samples: AudioSample[] = [];

  codec = ''

  config: number[] = [];

  sampleRate = 0;

  channelCount = 0;

  get sampleSize(): number {
    return this.samples.length;
  }

  exist(): boolean {
    return !!(this.sampleRate && this.channelCount);
  }

  reset(): void {
    this.pid = -1;
    // eslint-disable-next-line max-len
    this.sequenceNumber = this.timescale = this.baseMediaDecodeTime = this.duration = this.inserted = this.sampleRate = this.channelCount = this.dropped = 0;
    this.samples = [];
    this.config = [];
  }
}
