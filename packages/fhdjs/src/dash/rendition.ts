import { Rendition } from '../types';
import { PresentationTimeline } from './presentation-timeline';
import { CombinedVideoStream, CombinedAudioStream } from './stream';

export class DashRendition implements Rendition {
  dynamic = false;

  chunked = false;

  updateInterval = 0;

  dvrWindow = 0;

  latency = 0;

  maxLatency = 0;

  minLatency = 0;

  minPlaybackRate = 1;

  maxPlaybackRate = 1;

  maxSegmentDuration = 0;

  presentationTimeline = new PresentationTimeline();

  videoStreams: CombinedVideoStream[] = [];

  audioStreams: CombinedAudioStream[] = [];
}
