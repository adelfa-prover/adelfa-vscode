import type { Option } from './option';

declare global {
  interface Array<T> {
    chunk(size: number): T[][];
    skip(num: number): T[];
    dropEnd(num: number): T[];
    last(): T;
  }
}

Array.prototype.chunk = function <T>(size: number): T[][] {
  return Array.from(
    { length: Math.ceil(this.length / size) },
    (_, i) => this.slice(i * size, i * size + size) as T[],
  );
};

Array.prototype.skip = function <T>(num: number): T[] {
  return this.slice(num);
};

Array.prototype.dropEnd = function <T>(num: number): T[] {
  return this.slice(0, this.length - num);
};

Array.prototype.last = function <T>(): T {
  return this[this.length - 1];
};

export function zipFirst<T, U>(a1: T[], a2: U[]): [T, Option<U>][] {
  return a1.map((x, i) => [x, a2[i]]);
}

export function zipLongest<T, U>(a1: T[], a2: U[]): [T | undefined, U | undefined][] {
  const result: [T | undefined, U | undefined][] = [];
  const len = Math.max(a1.length, a2.length);
  for (let i = 0; i < len; i++) {
    result.push([a1[i], a2[i]]);
  }
  return result;
}

export function firstDifference<T>(a1: T[], a2: T[]): Option<number> {
  const res = zipLongest(a1, a2).findIndex(([x, y]) => x !== y);
  return res === -1 ? undefined : res;
}
