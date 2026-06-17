/**
 * Canonical JSON
 *
 * Stable serialization for hashing, replay snapshots, and audit fingerprints.
 * Ensures object keys are sorted and Map values are converted deterministically.
 */

export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export function toCanonicalValue(value: unknown): CanonicalValue {
  if (value === null) return null;

  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()]
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([key, val]) => [String(key), toCanonicalValue(val)]),
    );
  }

  if (Array.isArray(value)) {
    return value.map(toCanonicalValue);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, toCanonicalValue(val)]),
    );
  }

  return null;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value));
}

export function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalStringify(value)) as T;
}