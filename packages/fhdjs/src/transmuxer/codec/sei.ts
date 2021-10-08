export class SEI {
  static parse(unit: Uint8Array): { payload: Uint8Array, type: number, size: number, uuid: string } {
    const len = unit.length;
    let i = 1;
    let type = 0;
    let size = 0;
    let uuid = '';

    while (unit[i] === 255) {
      type += 255;
      i++;
    }
    type += unit[i++];

    while (unit[i] === 255) {
      size += 255;
      i++;
    }
    size += unit[i++];

    if (type === 5 && len > i + 16) {
      for (let j = 0; j < 16; j++) {
        uuid += unit[i].toString(16);
        i++;
      }
    }

    return {
      payload: unit.subarray(i), type, size, uuid,
    };
  }
}
