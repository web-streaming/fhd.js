import { Segment } from '../types';

export class HlsSegment implements Segment {
  url?: string;

  start = 0;

  duration = 0;

  sn = 0;

  periodId = 0;

  byteRange?: [number, number];

  title?: string;

  wallClockTime?: number;

  invalid?: boolean;

  prefetch = false;

  parts = [];

  get end() {
    return this.start + this.duration;
  }
}
