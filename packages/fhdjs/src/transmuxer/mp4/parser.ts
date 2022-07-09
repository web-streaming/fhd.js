import { readBig32, readBig64 } from '../helper';

export class MP4Parser {
  static parseSidx(data: Uint8Array) {
    const sidxBox = MP4Parser.findBox(data, 'sidx');
    if (!sidxBox) return;

    const version = sidxBox[0];
    const timescale = readBig32(data, 8);

    if (!timescale) return;

    let offset = 12;
    let earliestPresentationTime = 0;
    let firstOffset = 0;

    if (version) {
      earliestPresentationTime = readBig64(data, offset);
      firstOffset = readBig64(data, offset + 8);
      offset += 16;
    } else {
      earliestPresentationTime = readBig32(data, offset);
      firstOffset = readBig32(data, offset + 4);
      offset += 8;
    }

    offset += 2; // reserved

    const referenceCount = data[offset] << 8 | data[offset + 1];
    offset += 2;

    const references = [];
    let ref: number;
    let referenceType: number;
    for (let i = 0; i < referenceCount; i++) {
      ref = readBig32(data, offset);
      referenceType = (ref & 0x80000000) >>> 31;
      if (referenceType) throw new Error('referenceType=1 sidx is not support');
      offset += 4;
      references.push({
        duration: readBig32(data, offset),
        size: ref & 0x7FFFFFFF,
      });
      offset += 8;
    }

    return {
      earliestPresentationTime,
      firstOffset,
      timescale,
      references,
    };
  }

  static findBox(data: Uint8Array, type: string): Uint8Array | void {
    const dataLen = data.length;
    const target = MP4Parser.nameToNumber(type);
    let offset = 0;

    let size64 = false;
    let size: number;
    let name: number;
    while ((offset + 8) < dataLen) {
      size = readBig32(data, offset);
      name = readBig32(data, offset + 4);

      size64 = false;
      if (!size) {
        size = dataLen - offset;
      } else if (size === 1) {
        size = readBig64(data, offset + 8);
        size64 = true;
      }

      if (name === target) {
        return data.subarray(offset + (size64 ? 16 : 8), offset + size);
      }

      offset += size;
    }
  }

  private static nameToNumber(name: string): number {
    return [...name].reduce((a, c) => (a << 8) | c.charCodeAt(0), 0);
  }
}
