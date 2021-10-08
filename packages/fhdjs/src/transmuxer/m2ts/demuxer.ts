import {
  VideoSample, VideoTrack, AudioSample, AudioTrack, VideoCodecType, AudioCodecType,
} from '../domain';
import {
  AVC, MPEGAudio, AAC, HEVC, NALU,
} from '../codec';
import { concatUint8Array } from '../helper';
import { Demuxer } from '../types';

const TS_SECOND = 90000;

interface PES {
  data: Uint8Array;
  pts?: number;
  dts?: number;
}

export class TsDemuxer implements Demuxer {
  private pmtId = -1;

  private remainingPacketData?: Uint8Array;

  private videoPesData: Uint8Array[] = [];

  private audioPesData: Uint8Array[] = [];

  private nextVideoDts?: number;

  private nextExpectVideoDts?: number;

  private nextAudioPts?: number;

  private nextExpectAudioPts?: number;

  private refDts?: number;

  readonly videoTrack;

  readonly audioTrack;

  constructor(videoTrack?: VideoTrack, audioTrack?: AudioTrack) {
    this.videoTrack = videoTrack || new VideoTrack();
    this.audioTrack = audioTrack || new AudioTrack();
  }

  demux(
    data: Uint8Array,
    discontinuity = false,
    contiguous = true,
    startTime = 0,
  ) {
    if (!contiguous || discontinuity) {
      this.remainingPacketData = undefined;
      this.videoPesData = [];
      this.audioPesData = [];
    }

    const videoTrack = this.videoTrack;
    const audioTrack = this.audioTrack;

    if (discontinuity) {
      this.pmtId = -1;
      videoTrack.reset();
      audioTrack.reset();
    }

    videoTrack.samples = [];
    audioTrack.samples = [];

    if (this.remainingPacketData) {
      data = concatUint8Array(this.remainingPacketData, data);
      this.remainingPacketData = undefined;
    }

    let dataLen = data.length;
    const remainingLength = dataLen % 188;
    if (remainingLength) {
      this.remainingPacketData = data.subarray(dataLen - remainingLength);
      dataLen -= remainingLength;
    }

    let videoPid = videoTrack.pid;
    let audioPid = audioTrack.pid;
    let waitToParsePackets = [];

    for (let start = 0, len = data.length; start < len; start += 188) {
      if (data[start] !== 0x47) throw new Error('TS packet did not start with 0x47');
      const payloadUnitStartIndicator = !!(data[start + 1] & 0x40);
      const pid = ((data[start + 1] & 0x1f) << 8) + data[start + 2];
      const adaptationFiledControl = (data[start + 3] & 0x30) >> 4;

      let offset: number;
      if (adaptationFiledControl > 1) {
        offset = start + 5 + data[start + 4];
        if (offset === start + 188) continue;
      } else {
        offset = start + 4;
      }

      switch (pid) {
        case 0:
          if (payloadUnitStartIndicator) offset += data[offset] + 1;
          this.pmtId = ((data[offset + 10] & 0x1f) << 8) | data[offset + 11];
          break;
        case this.pmtId: {
          if (payloadUnitStartIndicator) offset += data[offset] + 1;
          const tableEnd = offset + 3 + (((data[offset + 1] & 0x0f) << 8) | data[offset + 2]) - 4;
          const programInfoLength = ((data[offset + 10] & 0x0f) << 8) | data[offset + 11];
          offset += 12 + programInfoLength;

          while (offset < tableEnd) {
            const esPid = ((data[offset + 1] & 0x1f) << 8) | data[offset + 2];

            switch (data[offset]) {
              case 0x03: // ISO/IEC 11172-3 (MPEG-1 audio)
              case 0x04: // ISO/IEC 13818-3 (MPEG-2 halved sample rate audio)
              case 0x0f: // AAC
                if (audioPid === -1) {
                  audioTrack.pid = audioPid = esPid;
                  audioTrack.codecType = data[offset] === 0x0f ? AudioCodecType.AAC : AudioCodecType.MPEG;
                }
                break;
              case 0x1b: // AVC
              case 0x24: // HEVC
                if (videoPid === -1) {
                  videoTrack.pid = videoPid = esPid;
                  videoTrack.codecType = data[offset] === 0x1b ? VideoCodecType.AVC : VideoCodecType.HEVC;
                }
                break;
              default:
                // TODO: waring
            }

            offset += (((data[offset + 3] & 0x0f) << 8) | data[offset + 4]) + 5;
          }

          if (waitToParsePackets.length) {
            // eslint-disable-next-line no-loop-func
            waitToParsePackets.forEach((packet) => {
              if (packet.pid === videoPid) {
                if (payloadUnitStartIndicator) this.parseVideo();
                this.videoPesData.push(data.subarray(offset, start + 188));
              } else if (packet.pid === audioPid) {
                if (payloadUnitStartIndicator) this.parseAudio();
                this.audioPesData.push(data.subarray(offset, start + 188));
              } else {
                // TODO: waring
              }
            });
            waitToParsePackets = [];
          }
        }
          break;
        case videoPid:
          if (payloadUnitStartIndicator) this.parseVideo();
          this.videoPesData.push(data.subarray(offset, start + 188));
          break;
        case audioPid:
          if (payloadUnitStartIndicator) this.parseAudio();
          this.audioPesData.push(data.subarray(offset, start + 188));
          break;
        case 17:
        case 0x1fff:
          break;
        default:
          if (this.pmtId === -1) {
            waitToParsePackets.push({
              payloadUnitStartIndicator,
              pid,
              data: data.subarray(offset, start + 188),
            });
          } else {
            // TODO: waring
          }
      }
    }

    this.parseVideo();
    this.parseAudio();

    videoTrack.timescale = TS_SECOND;
    audioTrack.timescale = audioTrack.sampleRate || 0;

    this.fix(startTime, contiguous);

    return {
      videoTrack,
      audioTrack,
    };
  }

  static probe(data: Uint8Array): boolean {
    if (!data.length) return false;
    return data[0] === 0x47 && data[188] === 0x47 && data[376] === 0x47;
  }

  private parseVideo(): void {
    if (!this.videoPesData.length) return;
    const pes = TsDemuxer.parsePES(concatUint8Array(...this.videoPesData));
    if (!pes) {
      // TODO: warning
      return;
    }
    this.videoPesData = [];

    const units = NALU.parseAnnexBNALus(pes.data);
    if (!units) {
      // TODO: waring
      return;
    }

    this.createVideoSample(units, pes.pts, pes.dts);
  }

  private createVideoSample(units: Uint8Array[], pts?: number, dts?: number): void {
    if (!units.length) return;
    const track = this.videoTrack;
    const isHevc = track.codecType === VideoCodecType.HEVC;

    let sample = new VideoSample(pts!, dts!);
    units.forEach((unit) => {
      const type = isHevc ? (unit[0] >>> 1) & 0x3f : unit[0] & 0x1f;
      switch (type) {
        case 5: // IDR
        case 16: // HEVC BLA_W_LP
        case 17: // HEVC BLA_W_RADL
        case 18: // HEVC BLA_N_LP
        case 19: // HEVC IDR_W_RADL
        case 20: // HEVC IDR_N_LP
        case 21: // HEVC CRA_NUT
        case 22: // HEVC RSV_IRAP_VCL22
        case 23: // HEVC RSV_IRAP_VCL23
          if ((!isHevc && type !== 5) || (isHevc && type === 5)) break;
          sample.asKey();
          break;
        case 6: // SEI
        case 39: // HEVC PREFIX_SEI
        case 40: // HEVC SUFFIX_SEI
          if ((!isHevc && type !== 6) || (isHevc && type === 6)) break;
          // TODO:
          break;
        case 7: // SPS
        case 33: // HEVC SPS
          if ((!isHevc && type !== 7) || (isHevc && type === 7)) break;
          if (!track.sps.length) {
            const data = NALU.removeEPB(unit);
            const spsInfo = isHevc ? HEVC.parseSPS(data) : AVC.parseSPS(data);
            track.sps = [unit];
            track.codec = spsInfo.codec;
            track.width = spsInfo.width;
            track.height = spsInfo.height;
            track.sarRatio = spsInfo.sarRatio;
          }
          break;
        case 8: // PPS
        case 34: // HEVC PPS
          if ((!isHevc && type !== 8) || (isHevc && type === 8)) break;
          if (!track.pps.length) track.pps = [unit];
          break;
        case 9: // AUD
        case 35: // HEVC AUD
          if ((!isHevc && type !== 9) || (isHevc && type === 9)) break;
          if (sample.units.length) {
            this.pushVideoSample(sample);
            sample = new VideoSample(pts!, dts!);
          }
          break;
      }
      sample.units.push(unit);
    });

    this.pushVideoSample(sample);
  }

  private pushVideoSample(sample: VideoSample): void {
    if (sample && sample.units.length) {
      const track = this.videoTrack;
      if (sample.pts == null) {
        const lastSample = track.samples[track.samples.length - 1];
        if (lastSample) {
          sample.pts = lastSample.pts;
          sample.dts = lastSample.dts;
        } else {
          // TODO: waring
          track.dropped++;
        }
      }
      track.samples.push(sample);
    }
  }

  private parseAudio(): void {
    if (!this.audioPesData.length) return;
    const pes = TsDemuxer.parsePES(concatUint8Array(...this.audioPesData));
    if (!pes) {
      // TODO: warning
      return;
    }
    this.audioPesData = [];

    if (this.audioTrack.codecType === AudioCodecType.AAC) {
      this.parseAac(pes);
    } else {
      this.parseMpeg(pes);
    }
  }

  private parseAac(pes: PES): void {
    let pts = pes.pts;
    if (pts == null) {
      if (!this.audioTrack.samples.length || !this.audioTrack.sampleRate) {
        // TODO: waring
        return;
      }
      pts = this.audioTrack.samples[this.audioTrack.samples.length - 1].pts!
            + AAC.getFrameDuration(this.audioTrack.sampleRate);
    }

    const ret = AAC.parseAdts(pes.data, pts);
    if (!ret) {
      // TODO: waring
      return;
    }

    const track = this.audioTrack;
    track.codec = ret.codec;
    track.channelCount = ret.channelCount;
    track.sampleRate = ret.sampleRate;
    track.samples.push(...ret.frames.map((s) => new AudioSample(s.pts, s.data)));

    // TODO: ret.skip warning
    // TODO: remaining warning
  }

  private parseMpeg(pes: PES): void {
    if (pes.pts == null) {
      // TODO: waring
      return;
    }

    const track = this.audioTrack;
    const ret = MPEGAudio.parse(pes.data, pes.pts);
    track.codec = 'mp3';
    track.channelCount = ret.channelCount;
    track.sampleRate = ret.sampleRate;
    track.samples.push(...ret.frames.map((s) => new AudioSample(s.pts, s.data)));

    if (ret.broken) {
      // TODO: waring
    }
  }

  private fix(startTime: number, contiguous: boolean): void {
    const audioSamples = this.audioTrack.samples;
    const videoSamples = this.videoTrack.samples;

    const hasAudio = audioSamples.length > 1;
    const hasVideo = videoSamples.length > 1;

    if (!hasAudio && !hasVideo) return;

    if (!contiguous || !this.refDts) {
      this.refDts = videoSamples[0]?.dts || audioSamples[0]?.pts;
    }

    if (hasVideo && hasAudio) {
      if (!contiguous || this.nextVideoDts == null) {
        const firstAudioPts = TsDemuxer.normalizePts(audioSamples[0].pts, this.refDts);
        const firstVideoPts = TsDemuxer.normalizePts(videoSamples[0].pts, this.refDts);
        const firstVideoDts = TsDemuxer.normalizePts(videoSamples[0].dts, this.refDts);
        const audioSampleDuration = Math.round(1024 * TS_SECOND / this.audioTrack.timescale);
        let delta = firstVideoPts - firstAudioPts;

        if (delta < 0) {
          let frames = Math.floor(-delta / audioSampleDuration);
          frames++;
          // TODO: waring
          const frame = AAC.getSilentFrame(
            this.audioTrack.codec, this.audioTrack.channelCount,
          ) || audioSamples[0].data.subarray();
          let nextPts = firstAudioPts;
          while (frames--) {
            nextPts -= audioSampleDuration;
            audioSamples.unshift(new AudioSample(nextPts, frame, 1024));
          }
          delta = firstVideoPts - nextPts;
        } else {
          const dtsDelta = firstVideoDts - firstAudioPts;
          if (dtsDelta > 0) {
            let frames = Math.floor(dtsDelta / audioSampleDuration) + 1;
            delta -= frames * audioSampleDuration;
            // TODO: waring
            while (frames--) audioSamples.shift();
          }
        }

        if (delta) {
          // TODO: waring
          this.videoTrack.samples[0].pts = firstVideoDts + delta;
        }
      }

      const delta = this.fixVideo(startTime, contiguous);
      this.fixAudio(startTime, contiguous, delta);
    } else if (hasVideo) {
      this.fixVideo(startTime, contiguous);
    } else {
      this.fixAudio(startTime, contiguous);
    }

    if (hasVideo) {
      this.refDts = videoSamples[videoSamples.length - 1].dts;
    } else {
      this.refDts = audioSamples[audioSamples.length - 1].pts;
    }
  }

  private fixVideo(startTime: number, contiguous: boolean): number {
    startTime *= TS_SECOND;
    const samples = this.videoTrack.samples;

    if (!contiguous || this.nextVideoDts == null) {
      this.nextVideoDts = Math.max(0, startTime - samples[0].cts);
      this.nextExpectVideoDts = 0;
    }

    samples.forEach((sample) => {
      sample.pts = TsDemuxer.normalizePts(sample.pts, this.refDts);
      sample.dts = TsDemuxer.normalizePts(sample.dts, this.refDts);
      if (sample.dts > sample.pts) sample.dts = sample.pts;
    });

    let delta = 0;
    if (this.nextExpectVideoDts) {
      delta = this.nextExpectVideoDts - samples[0].dts;
    }

    for (let i = 0, l = this.videoTrack.samples.length, curSample: VideoSample, nextSample: VideoSample; i < l; i++) {
      curSample = this.videoTrack.samples[i];
      nextSample = this.videoTrack.samples[i + 1];

      if (nextSample) {
        curSample.duration = nextSample.dts - curSample.dts;
      } else {
        curSample.duration = samples[i - 1].duration;
      }
    }

    this.videoTrack.baseMediaDecodeTime = this.nextVideoDts;
    const lastSample = samples[samples.length - 1];
    this.nextVideoDts += (lastSample.dts - samples[0].dts + lastSample.duration);
    this.nextExpectVideoDts = lastSample.dts + lastSample.duration;

    return delta;
  }

  private fixAudio(startTime: number, contiguous: boolean, videoDelta = 0): void {
    startTime *= TS_SECOND;
    const track = this.audioTrack;
    const samples = track.samples;

    samples.forEach((sample) => {
      sample.pts = TsDemuxer.normalizePts(sample.pts, this.refDts);
    });

    if (!contiguous || this.nextAudioPts == null) {
      this.nextAudioPts = Math.max(startTime, 0);
      this.nextExpectAudioPts = 0;
    }

    const sampleDuration = 1024 * TS_SECOND / track.timescale;

    if (this.nextExpectAudioPts) {
      const delta = this.nextExpectAudioPts - samples[0].pts + videoDelta;
      let frames = Math.floor(Math.abs(delta) / sampleDuration);
      if (frames) {
        if (delta > 0) {
          // TODO: waring
          while (frames--) samples.shift();
        } else {
          // TODO: waring
          const frame = AAC.getSilentFrame(track.codec, track.channelCount) || samples[0].data.subarray();
          let nextPts = samples[0].pts;
          while (frames--) {
            nextPts -= sampleDuration;
            samples.unshift(new AudioSample(nextPts, frame, 1024));
          }
        }
      }
    }

    this.audioTrack.baseMediaDecodeTime = Math.round(this.nextAudioPts * track.timescale / TS_SECOND);

    const totalDuration = Math.round(samples.length * sampleDuration);
    this.nextAudioPts += totalDuration;
    this.nextExpectAudioPts = samples[0].pts + totalDuration;
  }

  private static normalizePts(value: number, reference?: number): number {
    let offset;
    if (reference == null) return value;

    if (reference < value) {
      offset = -8589934592; // - 2^33
    } else {
      offset = 8589934592; // + 2^33
    }

    while (Math.abs(value - reference) > 4294967296) {
      value += offset;
    }

    return value;
  }

  private static parsePES(data: Uint8Array): void | PES {
    const headerDataLen = data[8];
    if (headerDataLen == null || data.length < (headerDataLen + 9)) return;
    const startPrefix = data[0] << 16 | data[1] << 8 | data[2];
    if (startPrefix !== 1) return;
    const pesLen = (data[4] << 8) + data[5];
    if (pesLen && pesLen > data.length - 6) return;

    let pts;
    let dts;
    const ptsDtsFlags = data[7];
    if (ptsDtsFlags & 0xc0) {
      pts = (data[9] & 0x0e) * 536870912 // 1 << 29
        + (data[10] & 0xff) * 4194304 // 1 << 22
        + (data[11] & 0xfe) * 16384 // 1 << 14
        + (data[12] & 0xff) * 128 // 1 << 7
        + (data[13] & 0xfe) / 2;

      if (ptsDtsFlags & 0x40) {
        dts = (data[14] & 0x0e) * 536870912 // 1 << 29
          + (data[15] & 0xff) * 4194304 // 1 << 22
          + (data[16] & 0xfe) * 16384 // 1 << 14
          + (data[17] & 0xff) * 128 // 1 << 7
          + (data[18] & 0xfe) / 2;
        if (pts - dts > 60 * TS_SECOND) pts = dts;
      } else {
        dts = pts;
      }
    }

    return { data: data.subarray(9 + headerDataLen), pts, dts };
  }
}
