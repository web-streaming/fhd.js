const RE_MPD_TIME = /^P(?:([0-9]*)Y)?(?:([0-9]*)M)?(?:([0-9]*)D)?(?:T(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9.]*)S)?)?$/;

export function parseDuration(durationString?: string | null): number | void {
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

export function findChildren(el: Element, name: string): Element[] {
  return Array.from(el.childNodes).filter((child) => child instanceof Element && el.tagName === name) as Element[];
}
