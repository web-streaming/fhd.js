import { chromeVersion } from '../../utils';

export class MPEGAudio {
  static parse(data: Uint8Array, pts: number, timescale = 90000) {
    const dataLen = data.length;

    let frameIndex = 0;
    let offset = 0;
    let broken = false;
    let sampleRate = 0;
    let channelCount = 0;
    const frames = [];

    while (offset < dataLen) {
      if (
        // is header
        offset + 1 < dataLen && data[offset] === 0xff && (data[offset + 1] & 0xe0) === 0xe0 && (data[offset + 1] & 0x06) !== 0x00
      ) {
        if (offset + 24 > dataLen) break;
        const header = MPEGAudio.parseHeader(data.subarray(offset));

        if (header && offset + header.frameLength <= data.length) {
          sampleRate = header.sampleRate;
          channelCount = header.channelCount;

          const frameDuration = (header.samplesPerFrame * timescale) / sampleRate;

          frames.push({
            data: data.subarray(offset, offset + header.frameLength),
            pts: pts + frameIndex * frameDuration,
          });

          offset += header.frameLength;
          frameIndex++;
        } else {
          broken = true;
          break;
        }
      } else {
        offset++;
      }
    }

    return {
      sampleRate,
      channelCount,
      broken,
      frames,
    };
  }

  static parseHeader(data: Uint8Array) {
    const mpegVersion = (data[1] >> 3) & 3;
    const mpegLayer = (data[1] >> 1) & 3;
    const bitRateIndex = (data[2] >> 4) & 15;
    const sampleRateIndex = (data[2] >> 2) & 3;

    if (
      mpegVersion !== 1
      && bitRateIndex !== 0
      && bitRateIndex !== 15
      && sampleRateIndex !== 3
    ) {
      const paddingBit = (data[2] >> 1) & 1;
      const channelMode = data[3] >> 6;
      const columnInBitRates = mpegVersion === 3 ? 3 - mpegLayer : mpegLayer === 3 ? 3 : 4;
      const bitRate = MPEGAudio.BitRatesMap[columnInBitRates * 14 + bitRateIndex - 1] * 1000;
      const columnInSampleRates = mpegVersion === 3 ? 0 : mpegVersion === 2 ? 1 : 2;
      const sampleRate = MPEGAudio.SamplingRateMap[columnInSampleRates * 3 + sampleRateIndex];
      const channelCount = channelMode === 3 ? 1 : 2;
      const sampleCoefficient = MPEGAudio.SamplesCoefficients[mpegVersion][mpegLayer];
      const bytesInSlot = MPEGAudio.BytesInSlot[mpegLayer];
      const samplesPerFrame = sampleCoefficient * 8 * bytesInSlot;
      const frameLength = Math.floor((sampleCoefficient * bitRate) / sampleRate + paddingBit)
        * bytesInSlot;

      if (
        chromeVersion && chromeVersion <= 87
        && mpegLayer === 2
        && bitRate >= 224000
        && channelMode === 0
      ) {
        // Work around bug in Chromium by setting channelMode to dual-channel (01) instead of stereo (00)
        data[3] |= 0x80;
      }

      return {
        sampleRate, channelCount, frameLength, samplesPerFrame,
      };
    }
  }

  static BitRatesMap = [
    32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 32, 48, 56,
    64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 32, 40, 48, 56, 64, 80,
    96, 112, 128, 160, 192, 224, 256, 320, 32, 48, 56, 64, 80, 96, 112, 128, 144,
    160, 176, 192, 224, 256, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144,
    160,
  ];

  static SamplingRateMap = [
    44100, 48000, 32000, 22050, 24000, 16000, 11025, 12000, 8000,
  ];

  static SamplesCoefficients = [
    // MPEG 2.5
    [
      0, // Reserved
      72, // Layer3
      144, // Layer2
      12, // Layer1
    ],
    // Reserved
    [
      0, // Reserved
      0, // Layer3
      0, // Layer2
      0, // Layer1
    ],
    // MPEG 2
    [
      0, // Reserved
      72, // Layer3
      144, // Layer2
      12, // Layer1
    ],
    // MPEG 1
    [
      0, // Reserved
      144, // Layer3
      144, // Layer2
      12, // Layer1
    ],
  ];

  static BytesInSlot = [
    0, // Reserved
    1, // Layer3
    1, // Layer2
    4, // Layer1
  ];
}
