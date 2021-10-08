export enum TrackType {
  VIDEO = 'video',
  AUDIO = 'audio'
}

export enum VideoCodecType {
  AVC = 'avc',
  HEVC = 'hevc'
}

export enum AudioCodecType {
  AAC = 'aac',
  MPEG = 'mpeg'
}

type TwoBit = 0 | 1 | 2 | 3;

export interface SampleFlag {
  isLeading?: TwoBit;

  dependsOn?: TwoBit;

  isDependedOn?: TwoBit;

  hasRedundancy?: TwoBit;

  isNonSyncSample?: 0 | 1;

  paddingValue?: number;

  degradationPriority?: number;
}
