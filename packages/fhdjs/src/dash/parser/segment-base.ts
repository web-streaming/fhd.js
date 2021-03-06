import { InitSegment } from '../../streaming';
import { DashSegment } from '../segment';
import { SegmentFinder } from '../types';
import { PresentationTimeline } from '../presentation-timeline';

export class SegmentBase implements SegmentFinder {
  constructor(
    public presentationTimeline: PresentationTimeline,
    private segments: DashSegment[],
    private initSegment?: InitSegment,
  ) {
    this.segments = segments;
    this.initSegment = initSegment;
  }

  findSegmentBySn(): void | DashSegment {
    throw new Error('Method not implemented.');
  }
}
