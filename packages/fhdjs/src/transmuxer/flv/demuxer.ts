import {
  VideoSample, VideoTrack, AudioSample, AudioTrack, VideoCodecType,
} from '../domain';
import {
  AAC, AVC, HEVC, NALU,
} from '../codec';
import { concatUint8Array, readBig32 } from '../helper';
import { Demuxer } from '../types';

export class FlvDemuxer implements Demuxer {
  private headerParsed = false;

  private remainingData: Uint8Array | null = null;

  readonly videoTrack;

  readonly audioTrack;

  constructor(videoTrack?: VideoTrack, audioTrack?: AudioTrack) {
    this.videoTrack = videoTrack || new VideoTrack();
    this.audioTrack = audioTrack || new AudioTrack();
  }

  demux(data: Uint8Array, discontinuity = false) {
    const audioTrack = this.audioTrack;
    const videoTrack = this.videoTrack;

    if (discontinuity) {
      this.headerParsed = false;
      this.remainingData = null;
      videoTrack.reset();
      audioTrack.reset();
    }

    if (this.remainingData) {
      data = concatUint8Array(this.remainingData, data);
      this.remainingData = null;
    }

    if (!data.length) {
      return {
        videoTrack,
        audioTrack,
      };
    }

    let offset = 0;
    if (!this.headerParsed) {
      if (!FlvDemuxer.probe(data)) throw new Error('Invalid flv file');
      this.headerParsed = true;
      offset = readBig32(data, 5) + 4;
    }

    videoTrack.samples = [];
    audioTrack.samples = [];

    const dataLen = data.length;

    let tagType;
    let dataSize;
    let timestamp;
    let bodyData;
    let prevTagSize;
    while ((offset + 15) < dataLen) {
      tagType = data[offset];
      dataSize = (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
      if (offset + 15 + dataSize > dataLen) break;
      timestamp = (
        (data[offset + 7] << 24 >>> 0)
        + (data[offset + 4] << 16)
        + (data[offset + 5] << 8)
        + data[offset + 6]
      );

      offset += 11;
      bodyData = data.subarray(offset, offset + dataSize);
      if (tagType === 8) {
        this.parseAudio(bodyData, timestamp);
      } else if (tagType === 9) {
        this.parseVideo(bodyData, timestamp);
      } else if (tagType === 18) {
        this.parseScript(bodyData, timestamp);
      } else {
        // TODO: waring
      }

      offset += dataSize;
      prevTagSize = readBig32(data, offset);
      if (prevTagSize !== 11 + dataSize) {
        // TODO: waring
      }

      offset += 4;
    }

    if (offset < dataLen) {
      this.remainingData = data.subarray(offset);
    }

    videoTrack.timescale = 1000;
    audioTrack.timescale = audioTrack.sampleRate || 0;

    return {
      videoTrack,
      audioTrack,
    };
  }

  static probe(data: Uint8Array): boolean {
    if (data[0] !== 0x46 || data[1] !== 0x4C || data[2] !== 0x56 || data[3] !== 0x01) {
      return false;
    }
    return readBig32(data, 5) >= 9;
  }

  private parseAudio(data: Uint8Array, pts: number) {
    if (!data.length) return;

    const format = (data[0] & 0xf0) >>> 4;
    const track = this.audioTrack;

    if (format !== 10) {
      // TODO: waring
      return;
    }

    if (data[1] === 0) { // AACPacketType
      const ret = AAC.parseAudioSpecificConfig(data.subarray(2));
      if (ret) {
        track.codec = ret.codec;
        track.channelCount = ret.channelCount;
        track.sampleRate = ret.sampleRate;
        track.config = ret.config;
        if (ret.originCodec !== ret.codec) {
          // TODO: waring
        }
      } else {
        // TODO: waring
      }
    } else if (data[1] === 1) { // Raw AAC frame data
      if (pts == null) return;
      track.samples.push(new AudioSample(pts, data.subarray(2)));
    } else {
      // TODO: waring
    }
  }

  private parseVideo(data: Uint8Array, dts: number) {
    if (data.length < 6) return;

    const frameType = (data[0] & 0xf0) >>> 4;
    const codecId = data[0] & 0x0f;

    const track = this.videoTrack;

    if (
      codecId !== 7 // AVC
      && codecId !== 12 // HEVC
    ) {
      // TODO: warning
      return;
    }

    const isHevc = codecId === 12;
    track.codecType = isHevc ? VideoCodecType.HEVC : VideoCodecType.AVC;

    const packetType = data[1];
    const cts = (((data[2] << 16) | (data[3] << 8) | (data[4])) << 8) >> 8;

    if (packetType === 0) {
      const configData = data.subarray(5);
      const ret = isHevc
        ? HEVC.parseDecoderConfigurationRecord(configData)
        : AVC.parseDecoderConfigurationRecord(configData);
      if (ret) {
        const {
          sps, ppsList, spsList, vpsList, nalUnitSize,
        } = ret;
        if (sps) {
          track.codec = sps.codec;
          track.width = sps.width;
          track.height = sps.height;
          track.sarRatio = sps.sarRatio;
        }
        if (spsList.length) track.sps = spsList;
        if (ppsList.length) track.pps = ppsList;
        if (vpsList && vpsList.length) track.vps = vpsList;
        if (nalUnitSize) track.nalUnitSize = nalUnitSize;
      } else {
        // TODO: waring
      }
    } else if (packetType === 1) {
      const units = NALU.parseAvcC(data.subarray(5), track.nalUnitSize);
      if (units && units.length) {
        const sample = new VideoSample(dts + cts, dts, units);
        if (frameType === 1) sample.asKey();
        track.samples.push(sample);

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
          }
        });
      } else {
        // TODO: waring
      }
    } else if (packetType === 2) {
      // AVC end of sequence
    } else {
      // TODO: waring
    }
  }

  private parseScript(data: Uint8Array, pts: number) {

  }
}
