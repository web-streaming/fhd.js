import { DashSegment } from './segment';

export interface SegmentFinder {
  findSegmentBySn(): DashSegment | void;
}
