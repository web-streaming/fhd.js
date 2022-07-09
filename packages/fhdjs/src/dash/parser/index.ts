import { MP4Parser } from '../../transmuxer';
import { NetLoader } from '../../net';
import { resolveUrl } from '../../utils';
import {
  fillUrlTemplate,
  findChildren, getContent, parseDate, parseDuration, parseFloatNumber, parseNumber, parseRange,
} from './helper';
import { DashSegment } from '../segment';
import { Url, StreamType } from '../../streaming';
import { SegmentBase } from './segment-base';
import { SegmentTemplate } from './segment-template';
import { SegmentList } from './segment-list';
import { SegmentFinder } from '../types';
import {
  DashAudioStream, DashStream, DashVideoStream, CombinedVideoStream, CombinedAudioStream,
} from '../stream';
import { DashRendition } from '../rendition';

enum SegmentType {
  BASE = 'segmentBase',
  LIST = 'segmentList',
  TEMPLATE = 'segmentTemplate'
}

type SegmentTag = 'segmentBase' | 'segmentList' | 'segmentTemplate'

interface BaseElement {
  id: string;
  baseUrl: string;
  segmentBase?: Element;
  segmentList?: Element;
  segmentTemplate?: Element;
  availabilityTimeOffset: number;
}

interface RepresentationBase extends BaseElement {
  mimeType: string;
  codecs: string;
  fps: number;
  sar?: [number, number];
  width: number;
  height: number;
  audioSamplingRate: number;
}

interface Representation extends RepresentationBase {
  parent: AdaptationSet;
  bitrate: number;
  segmentType: SegmentType;
  timescale: number;
  presentationTimeOffset: number;
  duration: number;
  startNumber: number;
}

interface AdaptationSet extends RepresentationBase{
  parent: Period;
  label?: string;
  lang: string;
  contentType: string;
}

interface Period extends BaseElement {
 parent: MPD;
 start: number;
 duration: number;
}

interface MPD {
  el: Element;
  location: string;
  baseUrl: string;
  mediaPresentationDuration?: number;
  rendition: DashRendition;
}

export class MPDParser {
  streamMap: Record<string, DashStream> = {}

  async parse(text: string, url: string, rendition?: DashRendition): Promise<DashRendition | void> {
    if (!text) return;

    const parser = new DOMParser();
    let xml: Document | undefined;
    try {
      xml = parser.parseFromString(text, 'text/xml');
    } catch (error) {
      // ignore
    }
    if (!xml) return;

    const root = xml.documentElement;
    if (root.tagName !== 'MPD') return;
    if (root.getElementsByTagName('parsererror').length > 0) return;

    let location = getContent(findChildren(root, 'Location')[0]);
    if (location) {
      location = resolveUrl(url, location);
    } else {
      location = url;
    }

    let baseUrl = getContent(findChildren(root, 'BaseURL')[0]);
    if (baseUrl) baseUrl = resolveUrl(location, baseUrl);

    if (!rendition) rendition = new DashRendition();

    const presentationTimeline = rendition.presentationTimeline;

    const mpd: MPD = {
      el: root,
      location,
      baseUrl: baseUrl || location,
      mediaPresentationDuration: parseDuration(root.getAttribute('mediaPresentationDuration')),
      rendition,
    };

    rendition.dynamic = root.getAttribute('type') === 'dynamic';
    rendition.updateInterval = parseDuration(root.getAttribute('minimumUpdatePeriod')) || rendition.updateInterval;
    rendition.maxSegmentDuration = parseDuration(root.getAttribute('maxSegmentDuration')) || rendition.maxSegmentDuration;
    rendition.dvrWindow = parseDuration(root.getAttribute('timeShiftBufferDepth')) || rendition.dvrWindow;
    rendition.latency = parseDuration(root.getAttribute('suggestedPresentationDelay')) || (parseDuration(root.getAttribute('minBufferTime')) || 0) * 3 || rendition.latency;
    presentationTimeline.availabilityStartTime = parseDate(root.getAttribute('availabilityStartTime')) || 0;

    if (rendition.dynamic) {
      const utcTiming = findChildren(root, 'UTCTiming')[0];
      if (utcTiming) {
        const schemeIdUri = utcTiming.getAttribute('schemeIdUri');
        const value = utcTiming.getAttribute('value');
        if (value) {
          switch (schemeIdUri) {
            case 'urn:mpeg:dash:utc:http-xsdate:2014':
            case 'urn:mpeg:dash:utc:http-xsdate:2012':
            case 'urn:mpeg:dash:utc:http-iso:2014':
            case 'urn:mpeg:dash:utc:http-iso:2012':
              presentationTimeline.setTimeSyncRequest(resolveUrl(mpd.baseUrl, value), 'GET');
              break;
            case 'urn:mpeg:dash:utc:http-head:2014':
            case 'urn:mpeg:dash:utc:http-head:2012':
              presentationTimeline.setTimeSyncRequest(resolveUrl(mpd.baseUrl, value), 'HEAD');
              break;
            case 'urn:mpeg:dash:utc:direct:2014':
            case 'urn:mpeg:dash:utc:direct:2012': {
              const date = Date.parse(value);
              // eslint-disable-next-line no-restricted-globals
              if (!isNaN(date)) {
                presentationTimeline.setTimeOffsetFromUTC(date);
              }
            }
              break;
          }
          presentationTimeline.tryTimeSync();
        }
      }
    }

    findChildren(root, 'ServiceDescription').forEach((sd) => {
      const Latency = findChildren(sd, 'Latency')[0];
      if (Latency) {
        const target = parseNumber(Latency.getAttribute('target'));
        const min = parseNumber(Latency.getAttribute('min'));
        const max = parseNumber(Latency.getAttribute('max'));
        if (target != null) rendition!.latency = target;
        if (min != null) rendition!.minLatency = min;
        if (max != null) rendition!.maxLatency = max;
      }
      const PlaybackRate = findChildren(sd, 'PlaybackRate')[0];
      if (PlaybackRate) {
        const min = parseFloatNumber(PlaybackRate.getAttribute('min'));
        const max = parseFloatNumber(PlaybackRate.getAttribute('max'));
        if (min != null) rendition!.minPlaybackRate = min;
        if (max != null) rendition!.maxPlaybackRate = max;
      }
    });

    await this.parsePeriods(mpd);

    return rendition;
  }

  private async parsePeriods(mpd: MPD) {
    const periodNodes = findChildren(mpd.el, 'Period');
    const periods: Period[] = [];
    const promStreams: (Promise<(DashStream | undefined)[]>)[] = [];

    let prevEnd = 0;
    for (let i = 0, l = periodNodes.length; i < l; i++) {
      const el = periodNodes[i];
      const next = periodNodes[i + 1];
      const start = parseDuration(el.getAttribute('start')) || prevEnd;
      let duration = 0;

      if (next) {
        const nextStart = parseDuration(el.getAttribute('start'));
        if (nextStart) {
          duration = nextStart - start;
        }
      } else if (mpd.mediaPresentationDuration) {
        duration = mpd.mediaPresentationDuration - start;
      }
      if (!duration) {
        duration = parseDuration(el.getAttribute('duration')) || 0;
      }

      const period: Period = {
        ...MPDParser.parseBaseElement(el, mpd.baseUrl),
        parent: mpd,
        start,
        duration,
      };
      period.id = period.id || String(start);
      promStreams.push(Promise.all(this.parseAdaptationSets(period, el)));
      periods.push(period);

      if (!duration) break;

      prevEnd = start + duration;
    }

    const streamMap: Record<string, DashStream[]> = {};
    const streams = await Promise.all(promStreams);

    streams.forEach((ss) => {
      ss.forEach((s) => {
        if (s) {
          const id = `${s.type}/${s.representationId}`;
          streamMap[id] = streamMap[id] || [];
          streamMap[id].push(s);
        }
      });
    });

    const videoStreams: CombinedVideoStream[] = [];
    const audioStreams: CombinedAudioStream[] = [];
    Object.keys(streamMap).forEach((key) => {
      if (!streamMap[key].length) return;
      const type = streamMap[key][0].type;
      switch (type) {
        case StreamType.VIDEO:
          videoStreams.push(new CombinedVideoStream(streamMap[key] as DashVideoStream[]));
          break;
        case StreamType.AUDIO:
          audioStreams.push(new CombinedAudioStream(streamMap[key] as DashAudioStream[]));
          break;
      }
    });

    mpd.rendition.videoStreams = videoStreams;
    mpd.rendition.audioStreams = audioStreams;
  }

  private parseAdaptationSets(period: Period, parentEl: Element): (Promise<DashVideoStream | DashAudioStream | undefined>)[] {
    return (findChildren(parentEl, 'AdaptationSet').map((el) => {
      const essentialProperties = findChildren(el, 'EssentialProperty');
      for (let i = 0; i < essentialProperties.length; i++) {
        if (essentialProperties[i].getAttribute('schemeIdUri') === 'http://dashif.org/guidelines/trickmode') return;
      }

      const adaptationSet: AdaptationSet = {
        ...MPDParser.parseRepresentationBase(el, period, period.parent),
        parent: period,
        contentType: el.getAttribute('contentType') || '',
        label: getContent(findChildren(el, 'Label')[0]) || el.getAttribute('label') || '',
        lang: el.getAttribute('lang') || 'und',
      };

      const streams = this.parseRepresentations(adaptationSet, el);
      if (!streams.length) return;
      return streams;
    }).filter(Boolean) as (Promise<DashVideoStream | DashAudioStream | undefined>)[][]).reduce((a, c) => a.concat(c));
  }

  private parseRepresentations(adaptationSet: AdaptationSet, parentEl: Element)
  : (Promise<DashVideoStream | DashAudioStream | undefined>)[] {
    const period = adaptationSet.parent;
    const mpd = period.parent;

    return findChildren(parentEl, 'Representation').map(async (el) => {
      const representation: Representation = {
        ...MPDParser.parseRepresentationBase(el, adaptationSet, mpd),
        parent: adaptationSet,
        bitrate: parseNumber(el.getAttribute('bandwidth')) || 0,
        segmentType: SegmentType.BASE,
        timescale: 1,
        presentationTimeOffset: 0,
        startNumber: 1,
        duration: 0,
      };

      const segmentBase = representation.segmentBase || adaptationSet.segmentBase || period.segmentBase;
      const segmentList = representation.segmentList || adaptationSet.segmentList || period.segmentList;
      const segmentTemplate = representation.segmentTemplate || adaptationSet.segmentTemplate || period.segmentTemplate;

      let segmentElement: Element | undefined;
      if (segmentBase) {
        segmentElement = segmentBase;
      } else if (segmentList) {
        segmentElement = segmentList;
        representation.segmentType = SegmentType.LIST;
      } else if (segmentTemplate) {
        segmentElement = segmentTemplate;
        representation.segmentType = SegmentType.TEMPLATE;
      } else if (adaptationSet.contentType === 'text') {
        // text
      } else {
        return;
      }

      if (!segmentElement) return;

      if (!mpd.rendition.chunked) {
        mpd.rendition.chunked = segmentElement.getAttribute('availabilityTimeComplete') === 'false';
      }

      const timescale = parseNumber(MPDParser.inheritAttribute(representation, representation.segmentType, 'timescale'));
      const presentationTimeOffset = parseNumber(MPDParser.inheritAttribute(representation, representation.segmentType, 'presentationTimeOffset'));
      const startNumber = parseNumber(MPDParser.inheritAttribute(representation, representation.segmentType, 'startNumber'));
      const duration = parseNumber(MPDParser.inheritAttribute(representation, representation.segmentType, 'duration'));
      if (startNumber) representation.startNumber = startNumber;
      if (timescale) representation.timescale = timescale;
      if (presentationTimeOffset) representation.presentationTimeOffset = presentationTimeOffset / representation.timescale;
      if (duration) representation.duration = duration / representation.timescale;

      let segmentFinder;
      switch (representation.segmentType) {
        case SegmentType.BASE:
          segmentFinder = await this.parseSegmentBase(representation);
          break;
        case SegmentType.LIST:
          segmentFinder = this.parseSegmentList(representation);
          break;
        case SegmentType.TEMPLATE:
          segmentFinder = this.parseSegmentTemplate(representation, segmentElement);
          break;
      }
      if (!segmentFinder) return;

      const mimeType = representation.mimeType || adaptationSet.mimeType;

      let type = adaptationSet.contentType;
      if (!type && mimeType) {
        type = mimeType.split('/')[0];
      }

      let stream: DashVideoStream | DashAudioStream | undefined;
      switch (type) {
        case 'video':
          stream = new DashVideoStream(segmentFinder);
          stream.fps = adaptationSet.fps;
          stream.width = representation.width || adaptationSet.width;
          stream.height = representation.height || adaptationSet.height;
          stream.sar = representation.sar || adaptationSet.sar;
          break;
        case 'audio':
          stream = new DashAudioStream(segmentFinder);
          stream.samplingRate = adaptationSet.audioSamplingRate || representation.audioSamplingRate;
          break;
      }

      if (stream) {
        stream.periodId = period.id;
        stream.periodStart = period.start;
        stream.periodEnd = period.duration ? period.start + period.duration : 0;
        stream.representationId = representation.id;
        stream.lang = adaptationSet.lang;
        stream.mimeType = representation.mimeType || adaptationSet.mimeType;
        stream.codecs = representation.codecs || adaptationSet.codecs;
        stream.bitrate = representation.bitrate;
        stream.label = adaptationSet.label || '';

        const id = `${stream.periodId}/${stream.representationId}`;
        stream.update(this.streamMap[id]);
        this.streamMap[id] = stream;
      }

      return stream;
    });
  }

  private async parseSegmentBase(representation: Representation): Promise<SegmentFinder | void> {
    const initialization = MPDParser.parseInitialization(representation, 'segmentBase');
    const index = MPDParser.parseIndex(representation, 'segmentBase');
    if (!index) return;
    let response;
    try {
      response = await new NetLoader().load({ url: index.url, range: index.range });
    } catch (error) {
      return;
    }
    if (!response) return;
    const sidx = MP4Parser.parseSidx(response.data);
    if (!sidx || !sidx.references.length) return;

    const period = representation.parent.parent;
    const timeOffset = period.start - representation.presentationTimeOffset / representation.timescale;
    const startNumber = representation.startNumber;

    const nextStartByte = index.range?.[0] || 0;
    let nextStart = sidx.earliestPresentationTime / sidx.timescale;
    const segments = sidx.references.map((ref, i) => {
      const segment = new DashSegment();
      segment.sn = startNumber + i;
      segment.url = index.url;
      segment.start = nextStart + timeOffset;
      segment.end = segment.start + ref.duration / sidx.timescale;
      nextStart += segment.duration;
      segment.range = [nextStartByte, nextStartByte + ref.size - 1];
      return segment;
    });

    return new SegmentBase(
      period.parent.rendition.presentationTimeline,
      segments,
      initialization,
    );
  }

  private parseSegmentList(representation: Representation): SegmentFinder | void {
    const initialization = MPDParser.parseInitialization(representation, 'segmentList');
    const segmentUrls = MPDParser.inheritChild(representation, 'segmentList', 'SegmentURL');
    if (!segmentUrls || !segmentUrls.length) return;

    const period = representation.parent.parent;
    const duration = representation.duration;

    let url: string | null;
    const mediaSegments: Url[] = [];
    for (let i = 0, l = segmentUrls.length; i < l; i++) {
      url = segmentUrls[i].getAttribute('media');
      if (!url) return;
      mediaSegments.push({
        url: segmentUrls[i].getAttribute('media') as string,
        range: parseRange(segmentUrls[i].getAttribute('mediaRange')),
      });
    }

    let timeline: [number, number][] | void;
    if (!duration) {
      timeline = MPDParser.parseSegmentTimeline(representation, 'segmentList');
    }

    let len = mediaSegments.length;
    if (timeline && timeline.length) {
      len = Math.min(len, timeline.length);
    }

    let prevEndTime = 0;
    if (duration) {
      prevEndTime = duration * (representation.startNumber - 1);
    } else if (timeline && timeline.length) {
      prevEndTime = timeline[0][0];
    }

    const periodDuration = period.duration;
    const timeOffset = period.start - representation.presentationTimeOffset;
    const baseUrl = representation.baseUrl;
    const startNumber = representation.startNumber;

    const segments: DashSegment[] = [];
    let endTime: number;
    for (let i = 0; i < len; i++) {
      if (duration) {
        endTime = prevEndTime + duration;
      } else if (timeline) {
        endTime = timeline[i][1];
      } else {
        if (len !== 1 && !periodDuration) return;
        endTime = prevEndTime + periodDuration;
      }

      const segment = new DashSegment();

      segment.sn = startNumber + i;
      segment.url = resolveUrl(baseUrl, mediaSegments[i].url);
      segment.range = mediaSegments[i].range;
      segment.start = prevEndTime + timeOffset;
      segment.end = endTime + timeOffset;
      segments.push(segment);

      prevEndTime = endTime;
    }

    if (!segments.length) return;

    return new SegmentList(
      period.parent.rendition.presentationTimeline,
      segments,
      initialization,
    );
  }

  private parseSegmentTemplate(representation: Representation, el: Element): SegmentFinder | void {
    let initialization: Url | undefined = { url: el.getAttribute('initialization') } as Url;
    if (!initialization.url) {
      initialization = MPDParser.parseInitialization(representation, 'segmentTemplate') as Url;
      if (initialization) {
        initialization.url = initialization.url!.split('$Bandwidth$').join(String(representation.bitrate)).split('$RepresentationID$').join(representation.id);
      } else {
        initialization = undefined;
      }
    }

    const mediaUrl = MPDParser.inheritAttribute(representation, 'segmentTemplate', 'media');
    if (!mediaUrl) return;
    let timeline: [number, number][] | undefined;
    if (!representation.duration) {
      timeline = MPDParser.parseSegmentTimeline(representation, 'segmentTemplate');
      if (!timeline || !timeline.length) return;
    }

    const period = representation.parent.parent;

    const url = resolveUrl(
      representation.baseUrl,
      fillUrlTemplate(mediaUrl, undefined, undefined, representation.id, representation.bitrate),
    );

    return new SegmentTemplate(
      url,
      period.parent.rendition.presentationTimeline,
      representation.startNumber,
      period.start,
      timeline,
      initialization,
    );
  }

  private static parseInitialization(
    representation: Representation, elName: SegmentTag,
  ): Url | undefined {
    const initializations = MPDParser.inheritChild(representation, elName, 'Initialization');
    if (!initializations) return;
    const initialization = initializations[0];
    const url = resolveUrl(representation.baseUrl, initialization.getAttribute('sourceURL'));
    if (!url) return;

    return {
      url,
      range: parseRange(initialization.getAttribute('range')),
    };
  }

  private static parseIndex(representation: Representation, elName: SegmentTag): Required<Url> | void {
    const indexes = MPDParser.inheritChild(representation, elName, 'RepresentationIndex');
    if (!indexes) return;
    const index = indexes[0];
    const url = resolveUrl(representation.baseUrl, index.getAttribute('sourceURL'));
    if (!url) return;
    const range = parseRange(index.getAttribute('range') || MPDParser.inheritAttribute(representation, elName, 'indexRange'));
    if (!range) return;

    return {
      url,
      range,
    };
  }

  private static parseSegmentTimeline(representation: Representation, elName: SegmentTag): [number, number][] | undefined {
    const segmentTimelines = MPDParser.inheritChild(representation, elName, 'SegmentTimeline');
    if (!segmentTimelines) return;
    const ss = findChildren(segmentTimelines[0], 'S');
    if (!ss.length) return;

    const periodDuration = representation.parent.parent.duration;
    const timescale = representation.timescale;

    const timeOffset = representation.parent.parent.start - representation.presentationTimeOffset;

    const timeline: [number, number][] = [];

    let startTime: number;
    let nextT = 0;
    let t: number | undefined;
    let d: number | undefined;
    let r: number;
    for (let i = 0, l = ss.length; i < l; i++) {
      t = parseNumber(ss[i].getAttribute('t'));
      d = parseNumber(ss[i].getAttribute('d'));
      r = parseNumber(ss[i].getAttribute('r')) || 0;
      if (!d) return timeline;

      t = t == null ? nextT : t;

      if (r < 0) {
        if (ss[i + 1]) {
          nextT = parseNumber(ss[i + 1]?.getAttribute('t')) as number;
          if (!nextT || t >= nextT) return timeline;
          r = Math.ceil((nextT - t) / d) - 1;
        } else {
          // eslint-disable-next-line no-restricted-globals
          if (!periodDuration || !isFinite(periodDuration) || t / timescale >= periodDuration) return timeline;
          r = Math.ceil((periodDuration * timescale - t) / d) - 1;
        }
      }

      if (timeline.length && (t !== nextT)) {
        timeline[timeline.length - 1][1] = t / timescale + timeOffset;
      }

      nextT = t;

      r += 1;
      for (let j = 0; j < r; j++) {
        startTime = nextT / timescale + timeOffset;
        timeline.push([startTime, startTime + d / timescale]);
        nextT = t + d;
      }
    }

    return timeline;
  }

  private static parseBaseElement(el: Element, baseUrl = '', availabilityTimeOffset = 0): BaseElement {
    const baseUrlEl = findChildren(el, 'BaseURL')[0];
    const segmentBase = findChildren(el, 'SegmentBase')[0];
    const segmentList = findChildren(el, 'SegmentList')[0];
    const segmentTemplate = findChildren(el, 'SegmentTemplate')[0];

    if (baseUrlEl) {
      const url = getContent(baseUrlEl);
      if (url) baseUrl = resolveUrl(baseUrl, url);
      availabilityTimeOffset += parseFloatNumber(baseUrlEl.getAttribute('availabilityTimeOffset')) || 0;
    }

    if (segmentBase) {
      availabilityTimeOffset += parseFloatNumber(segmentBase.getAttribute('availabilityTimeOffset')) || 0;
    }

    if (segmentTemplate) {
      availabilityTimeOffset += parseFloatNumber(segmentTemplate.getAttribute('availabilityTimeOffset')) || 0;
    }

    return {
      id: el.getAttribute('id') || '',
      baseUrl,
      segmentBase,
      segmentList,
      segmentTemplate,
      availabilityTimeOffset,
    };
  }

  private static parseRepresentationBase(el: Element, parent: Period | AdaptationSet, mpd: MPD): RepresentationBase {
    const frameRate = el.getAttribute('frameRate');
    const pixelAspectRatio = el.getAttribute('sar');

    let fps = 0;
    if (frameRate) {
      const res = frameRate.match(/^(\d+)\/(\d+)$/);
      if (res) {
        fps = Number(res[1]) / Number(res[2]);
      } else {
        fps = Number(frameRate);
      }

      // eslint-disable-next-line no-restricted-globals
      if (isNaN(fps)) fps = 0;
    }

    let sar: [number, number] | undefined;
    if (pixelAspectRatio) {
      sar = pixelAspectRatio.split(':').map((x) => Number(x)) as [number, number];
      // eslint-disable-next-line no-restricted-globals
      if (isNaN(sar[0]) || isNaN(sar[1])) sar = undefined;
    }

    if (!mpd.rendition.chunked) {
      findChildren(el, 'EssentialProperty').concat(findChildren(el, 'SupplementalProperty')).forEach((x) => {
        if (
          x.getAttribute('schemeIdUri') === 'urn:dvb:dash:lowlatency:critical:2019'
          && x.getAttribute('value') === 'true'
        ) {
          mpd.rendition.chunked = true;
        }
      });
    }

    return {
      ...MPDParser.parseBaseElement(el, parent.baseUrl, parent.availabilityTimeOffset),
      width: parseNumber(el.getAttribute('width')) || 0,
      height: parseNumber(el.getAttribute('height')) || 0,
      audioSamplingRate: parseNumber(el.getAttribute('audioSamplingRate')) || 0,
      codecs: el.getAttribute('codecs') || '',
      mimeType: el.getAttribute('mimeType') || '',
      fps,
      sar,
    };
  }

  private static inheritChild(representation: Representation, elName: SegmentTag, target: string): Element[] | void {
    return [
      representation[elName],
      representation.parent[elName],
      representation.parent.parent[elName],
    ].filter(Boolean).map((x) => findChildren(x as Element, target)).filter((x) => !!x.length)[0];
  }

  private static inheritAttribute(representation: Representation, elName: SegmentTag, target: string): string | null {
    return [
      representation[elName],
      representation.parent[elName],
      representation.parent.parent[elName],
    ].filter(Boolean).map((x) => x!.getAttribute(target)).filter(Boolean)[0];
  }
}
