import { SampleFlag } from './types';

export class VideoSample {
  key = false;

  duration = 0;

  size = 0;

  units: Uint8Array[] = [];

  pts;

  dts;

  flag: SampleFlag = {};

  get cts(): number {
    return this.pts - this.dts;
  }

  constructor(pts: number, dts: number, units?: Uint8Array[]) {
    this.pts = pts;
    this.dts = dts;
    if (units) this.units = units;
  }

  asKey(): void {
    this.key = true;
    this.flag.dependsOn = 2;
    this.flag.isNonSyncSample = 0;
  }
}
