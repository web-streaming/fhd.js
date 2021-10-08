export * from './env';
export { resolveUrl } from './url';

export function binarySearch<T>(list: T[], compare: (item: T, index: number) => number): T | void {
  let lo = 0;
  let hi = list.length - 1;
  if (hi < 1) return list[0];

  let pos: number;
  let match: number;
  while (hi >= lo) {
    pos = Math.floor((lo + hi) / 2);

    match = compare(list[pos], pos);
    if (!match) return list[pos];
    if (match > 0) {
      lo = pos + 1;
    } else {
      hi = pos - 1;
    }
  }
}
