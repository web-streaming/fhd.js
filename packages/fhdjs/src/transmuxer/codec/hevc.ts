import { SPSInfo, DecoderConfigurationRecordResult } from '../types';

export class HEVC {
  static parseSPS(unit: Uint8Array): SPSInfo {

  }

  static parseDecoderConfigurationRecord(data: Uint8Array): DecoderConfigurationRecordResult | void {
    if (data.length < 23) return;
    const nalUnitSize = (data[21] & 3) + 1;

    let spsInfo;
    const spsList = [];
    const ppsList = [];
    const vpsList = [];

    let offset = 23;
    const numOfArrays = data[22];

    let nalUnitType;
    let numNALus;
    let nalSize;
    for (let i = 0; i < numOfArrays; i++) {
      nalUnitType = data[offset] & 0x3f;
      numNALus = (data[offset + 1] << 8) | data[offset + 2];

      offset += 3;

      for (let j = 0; j < numNALus; j++) {
        nalSize = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        if (!nalSize) continue;
        switch (nalUnitType) {
          case 32:
            vpsList.push(data.subarray(offset, offset + nalSize));
            break;
          case 33: {
            const sps = data.subarray(offset, offset + nalSize);
            if (!spsInfo) spsInfo = HEVC.parseSPS(sps);
            spsList.push(sps);
          }
            break;
          case 34:
            ppsList.push(data.subarray(offset, offset + nalSize));
            break;
        }

        offset += nalUnitSize;
      }
    }

    return {
      sps: spsInfo,
      spsList,
      ppsList,
      vpsList,
      nalUnitSize,
    };
  }
}
