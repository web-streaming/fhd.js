export function getRangeValue(value?: [number | undefined, number | undefined]): string | undefined {
  if (!value || value[0] == null || (value[0] === 0 && value[1] == null)) {
    return;
  }
  let ret = `bytes=${value[0]}-`;
  if (value[1]) ret += value[1];
  return ret;
}
