const RE_MPD_TIME = /^P(?:([0-9]*)Y)?(?:([0-9]*)M)?(?:([0-9]*)D)?(?:T(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9.]*)S)?)?$/;
const RE_DATE = /^\d+-\d+-\d+T\d+:\d+:\d+(\.\d+)?$/;
const RE_URL_TEMPLATE = /\$(RepresentationID|Number|Bandwidth|Time)?(?:%0([0-9]+)([diouxX]))?\$/g;

export function parseDuration(durationString?: string | null): number | undefined {
  if (!durationString) return;

  const matches = RE_MPD_TIME.exec(durationString);

  if (!matches) return;

  const s = 31536000 * Number(matches[1] || 0) // years
          + 2592000 * Number(matches[2] || 0) // months
          + 86400 * Number(matches[3] || 0) // days
          + 3600 * Number(matches[4] || 0) // hours
          + 60 * Number(matches[5] || 0) // minutes
          + Number(matches[6] || 0); // seconds

  // eslint-disable-next-line no-restricted-globals
  if (isFinite(s)) return s;
}

export function parseDate(str: string | null): number | undefined {
  if (!str) return;

  if (RE_DATE.test(str)) str += 'Z';

  const result = Date.parse(str);

  // eslint-disable-next-line no-restricted-globals
  if (!isNaN(result)) return Math.floor(result / 1000);
}

export function parseNumber(num: any): number | undefined {
  if (num == null) return;
  const ret = parseInt(num, 10);
  // eslint-disable-next-line no-restricted-globals
  if (!isNaN(ret) && isFinite(ret)) return ret;
}

export function parseFloatNumber(num: any): number | undefined {
  if (num == null) return;
  const ret = parseFloat(num);
  // eslint-disable-next-line no-restricted-globals
  if (!isNaN(ret)) return ret;
}

export function parseRange(rangeStr?: string | null | void): [number, number] | undefined {
  if (!rangeStr) return;
  const range = rangeStr.split('-').map((x) => parseNumber(x)).filter((x) => x != null);
  if (!range.length) return;

  return range as [number, number];
}

export function findChildren(el: Element, name: string): Element[] {
  return Array.from(el.childNodes).filter((child) => child instanceof Element && el.tagName === name) as Element[];
}

export function getContent(el: Element | null | undefined): string | undefined {
  if (!el || !el.textContent) return;
  return el.textContent.trim();
}

export function fillUrlTemplate(
  url: string, number?: number, time?: number, representationId?: string, bandwidth?: number,
): string {
  const valueTable: any = {
    RepresentationID: representationId,
    Number: number,
    Bandwidth: bandwidth,
    Time: time,
  };

  let value;
  let valueString;
  return url.replace(RE_URL_TEMPLATE, (match, name, widthStr, format) => {
    if (match === '$$') return '$';

    value = valueTable[name];

    if (value == null) return match;
    if (name === 'RepresentationID' && widthStr) widthStr = undefined;
    if (name === 'Time') value = Math.round(value);

    switch (format) {
      case 'o':
        valueString = value.toString(8);
        break;
      case 'x':
        valueString = value.toString(16);
        break;
      case 'X':
        valueString = value.toString(16).toUpperCase();
        break;
      default:
        valueString = String(value);
        break;
    }

    const padding = (new Array(
      Math.max(0, (parseNumber(widthStr) || 1) - valueString.length) + 1,
    )).join('0');

    return padding + valueString;
  });
}
