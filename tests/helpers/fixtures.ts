import { readFileSync } from 'node:fs';

/** Loads a JSON fixture from tests/fixtures (a fresh copy every call). */
export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
}
