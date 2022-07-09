import { Manifestor } from './streaming';
import { Demuxer, Remuxer } from './transmuxer';

export class Register {
  private manifestorMimeMap: Record<string, Manifestor> = Object.create(null);

  private manifestorExtMap: Record<string, Manifestor> = Object.create(null);

  getManifestorByMime(mime?: string): Manifestor | undefined {
    if (mime == null) return;
    return this.manifestorMimeMap[mime];
  }

  getManifestorByExt(ext?: string): Manifestor | undefined {
    if (ext == null) return;
    return this.manifestorExtMap[ext];
  }

  getDemuxerByMime(mime?: string): Demuxer | undefined {
    if (mime == null) return;
  }

  getDemuxerByExt(ext?: string) {

  }

  getRemuxer() {

  }

  registerManifestorByMime(mime: string, manifestor: Manifestor) {
    this.manifestorMimeMap[mime] = manifestor;
  }

  registerManifestorByExt(ext: string, manifestor: Manifestor) {
    this.manifestorExtMap[ext] = manifestor;
  }

  registerDemuxerByMime(mime: string, demuxer: Demuxer) {

  }

  registerDemuxerByExt(ext: string, demuxer: Demuxer) {

  }

  registerRemuxer(remuxer: Remuxer) {

  }
}
