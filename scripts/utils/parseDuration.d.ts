export interface DurationUnitMap {
  [key: string]: number | string;
  year: number;
  yr: number;
  y: number;
  month: number;
  mo: number;
  mth: number;
  week: number;
  wk: number;
  w: number;
  day: number;
  d: number;
  hour: number;
  hr: number;
  h: number;
  minute: number;
  min: number;
  m: number;
  second: number;
  sec: number;
  s: number;
  millisecond: number;
  millisec: number;
  ms: number;
  microsecond: number;
  microsec: number;
  us: number;
  'µs': number;
  nanosecond: number;
  nanosec: number;
  ns: number;
  group: string;
  decimal: string;
  placeholder: string;
}

export interface ParseDuration {
  (str?: string | number, format?: string): number | null;
  unit: DurationUnitMap;
  default: ParseDuration;
}

declare const parseDuration: ParseDuration;
export default parseDuration;
