import { differenceInSeconds, formatDistanceStrict } from 'date-fns';

export const formatDurationBetween = (from: number, to: number): string => {
  return formatDistanceStrict(new Date(from * 1000), new Date(to * 1000), { addSuffix: true });
};

export const secondsUntil = (futureTimestamp: number): number => {
  return Math.max(0, differenceInSeconds(new Date(futureTimestamp * 1000), new Date()));
};
