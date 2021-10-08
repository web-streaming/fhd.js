import { Rendition, Subtitle } from '../types';

export class DashRendition implements Rendition {
  dynamic = false;

  start = 0;

  startPrecise?: boolean;

  segmentDuration?: number;

  delay?: number;

  lhls = false;

  llhls = false;

  streams = [];

  subtitles: Subtitle[] = [];
}
