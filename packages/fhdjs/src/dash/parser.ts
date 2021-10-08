import { findChildren, parseDuration } from './parser/helper';

export class MPDParser {
  static parse(text: string) {
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

    return root;
  }

  private static parsePeriods(node: Element) {
    const mediaPresentationDuration = parseDuration(node.getAttribute('mediaPresentationDuration'));
    const periods = findChildren(node, 'Period');

    periods.forEach((period) => {
      findChildren(period, 'AdaptationSet').map((x) => MPDParser.parseAdaptationSet(x)).filter(Boolean);
    });
  }

  private static parseAdaptationSet(node: Element) {

  }

  private static parseRepresentation() {

  }
}
