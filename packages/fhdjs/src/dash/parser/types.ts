export interface RepresentationBase {
  sar?: [number, number];
  bitrate?: number;
  fps?: number;
  width?: number;
  height?: number;
  audioSamplingRate?: number;
  codecs?: string;
  mimeType?: string;
}

export interface Representation extends RepresentationBase {
  id: number;
}

export interface AdaptationSet extends RepresentationBase {
  id?: number;
  group?: number;
  lang?: string;
  contentType?: string;
}
