'use strict';

const unit = Object.create(null);
const minute = 60_000;
const hour = minute * 60;
const day = hour * 24;
const year = day * 365.25;

unit.year = unit.yr = unit.y = year;
unit.month = unit.mo = unit.mth = year / 12;
unit.week = unit.wk = unit.w = day * 7;
unit.day = unit.d = day;
unit.hour = unit.hr = unit.h = hour;
unit.minute = unit.min = unit.m = minute;
unit.second = unit.sec = unit.s = 1_000;
unit.millisecond = unit.millisec = unit.ms = 1;
unit.microsecond = unit.microsec = unit.us = unit['µs'] = 1e-3;
unit.nanosecond = unit.nanosec = unit.ns = 1e-6;

unit.group = ',';
unit.decimal = '.';
unit.placeholder = ' _';

const durationRE = /((?:\d{1,16}(?:\.\d{1,16})?|\.\d{1,16})(?:[eE][-+]?\d{1,4})?)\s?([\p{L}]{0,14})/gu;

function parseDuration(str = '', format = 'ms') {
  let result = null;
  let prevUnits;
  const stringValue = String(str);
  const cleaned = stringValue
    .replace(new RegExp(`(\\d)[${unit.placeholder}${unit.group}](\\d)`, 'g'), '$1$2')
    .replace(unit.decimal, '.');

  cleaned.replace(durationRE, (_, numeric, providedUnits) => {
    let units = providedUnits;

    if (!units) {
      if (prevUnits) {
        for (const candidate in unit) {
          if (!Object.prototype.hasOwnProperty.call(unit, candidate)) continue;
          const value = unit[candidate];
          if (typeof value === 'number' && value < prevUnits) {
            units = candidate;
            break;
          }
        }
      } else {
        units = format;
      }
    } else {
      units = units.toLowerCase();
    }

    prevUnits = units = unit[units] || unit[units.replace(/s$/, '')];

    if (units) {
      const parsedNumber = Number(numeric);
      if (!Number.isNaN(parsedNumber)) {
        result = (result ?? 0) + parsedNumber * units;
      }
    }

    return '';
  });

  if (result === null) {
    return null;
  }

  const divisor = unit[format] || 1;
  const sign = stringValue.trim().startsWith('-') ? -1 : 1;
  return (result / divisor) * sign;
}

parseDuration.unit = unit;
parseDuration.default = parseDuration;

module.exports = parseDuration;
