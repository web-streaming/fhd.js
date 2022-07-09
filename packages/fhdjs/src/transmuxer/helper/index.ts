export { ExpGolomb } from './exp-golomb';

export function concatUint8Array(...arr: Uint8Array[]): Uint8Array {
  const data = new Uint8Array(arr.reduce((p, c) => p + c.byteLength, 0));
  let prevLen = 0;
  arr.forEach((d) => {
    data.set(d, prevLen);
    prevLen += d.byteLength;
  });
  return data;
}

export function readBig32(data: Uint8Array, i = 0): number {
  return ((data[i] << 24 >>> 0) + (data[i + 1] << 16) + (data[i + 2] << 8) + (data[i + 3] || 0));
}

export function readBig64(data: Uint8Array, i = 0): number {
  // eslint-disable-next-line no-restricted-properties
  return (readBig32(data, i) * Math.pow(2, 32)) + readBig32(data, i + 4);
}
