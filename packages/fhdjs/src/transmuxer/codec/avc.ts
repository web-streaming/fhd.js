import { ExpGolomb } from '../helper';
import { SPSInfo, DecoderConfigurationRecordResult } from '../types';

export class AVC {
  static parseSPS(unit: Uint8Array): SPSInfo {
    const eg = new ExpGolomb(unit);
    eg.readUByte();

    const profileIdc = eg.readUByte();
    eg.skipUEG();

    if (
      profileIdc === 100
      || profileIdc === 110
      || profileIdc === 122
      || profileIdc === 244
      || profileIdc === 44
      || profileIdc === 83
      || profileIdc === 86
      || profileIdc === 118
      || profileIdc === 128
    ) {
      const chromaFormatIdc = eg.readUEG();
      if (chromaFormatIdc === 3) eg.skipBits(1);
      eg.skipUEG();
      eg.skipUEG();
      eg.skipBits(1);
      if (eg.readBool()) {
        const scalingListCount = chromaFormatIdc !== 3 ? 8 : 12;
        for (let i = 0; i < scalingListCount; i++) {
          if (eg.readBool()) {
            if (i < 6) {
              eg.skipScalingList(16);
            } else {
              eg.skipScalingList(64);
            }
          }
        }
      }
    }

    eg.skipUEG();
    const picOrderCntType = eg.readUEG();
    if (picOrderCntType === 0) {
      eg.readUEG();
    } else if (picOrderCntType === 1) {
      eg.skipBits(1);
      eg.skipEG();
      eg.skipEG();
      const numRefFramesInPicOrderCntCycle = eg.readUEG();
      for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
        eg.skipEG();
      }
    }

    eg.skipUEG();
    eg.skipBits(1);
    const picWidthInMbsMinus1 = eg.readUEG();
    const picHeightInMapUnitsMinus1 = eg.readUEG();
    const frameMbsOnlyFlag = eg.readBits(1);
    if (frameMbsOnlyFlag === 0) eg.skipBits(1);
    eg.skipBits(1);

    let frameCropLeftOffset = 0;
    let frameCropRightOffset = 0;
    let frameCropTopOffset = 0;
    let frameCropBottomOffset = 0;

    if (eg.readBool()) {
      frameCropLeftOffset = eg.readUEG();
      frameCropRightOffset = eg.readUEG();
      frameCropTopOffset = eg.readUEG();
      frameCropBottomOffset = eg.readUEG();
    }

    let sarRatio: [number, number] = [1, 1];
    if (eg.readBool()) {
      if (eg.readBool()) {
        const aspectRatioIdc = eg.readUByte();
        switch (aspectRatioIdc) {
          case 1: sarRatio = [1, 1]; break;
          case 2: sarRatio = [12, 11]; break;
          case 3: sarRatio = [10, 11]; break;
          case 4: sarRatio = [16, 11]; break;
          case 5: sarRatio = [40, 33]; break;
          case 6: sarRatio = [24, 11]; break;
          case 7: sarRatio = [20, 11]; break;
          case 8: sarRatio = [32, 11]; break;
          case 9: sarRatio = [80, 33]; break;
          case 10: sarRatio = [18, 11]; break;
          case 11: sarRatio = [15, 11]; break;
          case 12: sarRatio = [64, 33]; break;
          case 13: sarRatio = [160, 99]; break;
          case 14: sarRatio = [4, 3]; break;
          case 15: sarRatio = [3, 2]; break;
          case 16: sarRatio = [2, 1]; break;
          case 255: {
            sarRatio = [
              (eg.readUByte() << 8) | eg.readUByte(),
              (eg.readUByte() << 8) | eg.readUByte(),
            ];
            break;
          }
        }
      }
    }

    const codecs = unit.subarray(1, 4);
    let codec = 'avc1.';
    for (let i = 0; i < 3; i++) {
      let h = codecs[i].toString(16);
      if (h.length < 2) h = `0${h}`;
      codec += h;
    }

    return {
      codec,
      width: Math.ceil(
        (picWidthInMbsMinus1 + 1) * 16
          - 2 * (frameCropLeftOffset + frameCropRightOffset),
      ),
      height:
        (2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16
        - (frameMbsOnlyFlag ? 2 : 4)
          * (frameCropTopOffset + frameCropBottomOffset),
      sarRatio,
    };
  }

  static parseDecoderConfigurationRecord(data: Uint8Array): DecoderConfigurationRecordResult | void {
    if (data.length < 7) return;
    const nalUnitSize = (data[4] & 3) + 1;

    let spsInfo;
    const spsList = [];
    const ppsList = [];

    let offset = 6;
    const spsCount = data[5] & 0x1f;
    let spsSize;
    for (let i = 0; i < spsCount; i++) {
      spsSize = (data[offset] << 8) | data[offset + 1];
      offset += 2;
      if (!spsSize) continue;

      const sps = data.subarray(offset, offset + spsSize);
      offset += spsSize;
      spsList.push(sps);

      if (!spsInfo) {
        spsInfo = AVC.parseSPS(sps);
      }
    }

    const ppsCount = data[offset];
    offset++;
    let ppsSize;
    for (let i = 0; i < ppsCount; i++) {
      ppsSize = (data[offset] << 8) | data[offset + 1];
      offset += 2;
      if (!ppsSize) continue;
      ppsList.push(data.subarray(offset, offset + ppsSize));
      offset += ppsSize;
    }

    return {
      sps: spsInfo,
      spsList,
      ppsList,
      nalUnitSize,
    };
  }
}
