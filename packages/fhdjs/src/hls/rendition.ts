import { Rendition, Subtitle } from '../types';
import { HlsStream } from './stream';

export class HlsRendition implements Rendition {
  dynamic = true;

  start = 0;

  startPrecise?: boolean;

  segmentDuration?: number;

  delay?: number;

  lhls = false;

  llhls = false;

  streams: HlsStream[] = [];

  subtitles: Subtitle[] = [];
}
