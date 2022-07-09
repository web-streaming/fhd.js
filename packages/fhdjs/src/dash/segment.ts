import { Segment } from '../types';

export class DashSegment implements Segment {
  url?: string;

  start = 0;

  end = 0;

  duration = 0;

  sn = 0;

  periodId = 0;

  range?: [number, number];

  title?: string;

  wallClockTime?: number;

  invalid?: boolean;
}
