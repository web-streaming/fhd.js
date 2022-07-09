import { InitSegment } from '../../streaming';
import { DashSegment } from '../segment';
import { SegmentFinder } from '../types';
import { PresentationTimeline } from '../presentation-timeline';

export class SegmentTemplate implements SegmentFinder {
  constructor(
    private url: string,
    public presentationTimeline: PresentationTimeline,
    private startNumber: number,
    private periodStart: number,
    private timeline?: [number, number][],
    private initSegment?: InitSegment,
  ) {
    this.presentationTimeline = presentationTimeline;
    this.startNumber = startNumber;
    this.periodStart = periodStart;
    this.timeline = timeline;
    this.initSegment = initSegment;
  }

  findSegmentBySn(): void | DashSegment {
    throw new Error('Method not implemented.');
  }
}
