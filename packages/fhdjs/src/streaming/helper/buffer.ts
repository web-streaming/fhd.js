export class Buffer {
  static start(buf?: TimeRanges): number {
    if (!buf || !buf.length) return 0;

    // Safari bug: https://bit.ly/2trx6O8
    if (buf.length === 1 && buf.end(0) - buf.start(0) < 1e-6) return 0;
    // Edge bug: https://bit.ly/2JYLPeB
    if (buf.length === 1 && buf.start(0) < 0) return 0;

    return buf.start(0);
  }

  static end(buf?: TimeRanges): number {
    if (!buf || !buf.length) return 0;

    // Safari bug: https://bit.ly/2trx6O8
    if (buf.length === 1 && buf.end(0) - buf.start(0) < 1e-6) return 0;

    return buf.end(buf.length - 1);
  }

  static get(b?: { buffered?: TimeRanges }): TimeRanges | undefined {
    if (!b) return;
    try {
      return b.buffered;
    } catch (error) {
      // ignore
    }
  }

  static buffers(buf?: TimeRanges, maxHole?: number): [number, number][] {
    if (!buf || !buf.length) return [];

    const buffers: [number, number][] = [];
    for (let i = 0, l = buf.length; i < l; i++) {
      const bufLen = buffers.length;
      if (!bufLen || !maxHole) {
        buffers.push([buf.start(i), buf.end(i)]);
      } else {
        const last = buffers[bufLen - 1];
        const lastEnd = last[1];
        const start = buf.start(i);
        if (start - lastEnd <= maxHole) {
          const end = buf.end(i);
          if (end > lastEnd) {
            last[1] = end;
          }
        } else {
          buffers.push([buf.start(i), buf.end(i)]);
        }
      }
    }

    return buffers;
  }

  static info(buf: TimeRanges, pos = 0, maxHole = 0) {
    if (!buf || !buf.length) return;

    let start = 0;
    let end = 0;
    let index = 0;
    let nextStart = 0;
    let nextEnd = 0;
    let prevStart = 0;
    let prevEnd = 0;
    const buffers = Buffer.buffers(buf, maxHole);

    for (let i = 0, l = buffers.length; i < l; i++) {
      const item = buffers[i];
      if (pos + maxHole >= item[0] && pos < item[1]) {
        start = item[0];
        end = item[1];
        index = i;
      } else if (pos + maxHole < item[0]) {
        nextStart = item[0];
        nextEnd = item[1];
        break;
      } else if (pos + maxHole > item[1]) {
        prevStart = item[0];
        prevEnd = item[1];
      }
    }

    return {
      start,
      end,
      index,
      buffers,
      nextStart,
      nextEnd,
      prevStart,
      prevEnd,
    };
  }
}
