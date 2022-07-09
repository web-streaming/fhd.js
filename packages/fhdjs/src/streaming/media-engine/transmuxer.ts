import { TsDemuxer, FlvDemuxer } from '../../transmuxer';

export class Transmuxer {
  static isTsOrFlv(data: Uint8Array): boolean {
    return TsDemuxer.probe(data) || FlvDemuxer.probe(data);
  }

  trans() {

  }
}
