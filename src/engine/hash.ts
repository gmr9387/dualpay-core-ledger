/**
 * Deterministic Hash Utilities
 *
 * Used for:
 * - trace fingerprints
 * - replay verification
 * - run IDs
 * - evidentiary integrity
 *
 * NOTE:
 * Current implementation uses Web Crypto SHA-256.
 */

import { canonicalStringify } from './canonical-json';

export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();

  const data = encoder.encode(input);

  const digest = await crypto.subtle.digest(
    'SHA-256',
    data,
  );

  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashObject(
  obj: unknown,
): Promise<string> {
  return sha256(
    canonicalStringify(obj),
  );
}

export async function buildTraceFingerprint(args: {
  claim: unknown;
  accumulators: unknown;
  contract: unknown;
  plan: unknown;
  priorOutcomes: unknown;
  calcPolicyVersion: string;
}): Promise<string> {
  return hashObject({
    claim: args.claim,
    accumulators: args.accumulators,
    contract: args.contract,
    plan: args.plan,
    priorOutcomes: args.priorOutcomes,
    calcPolicyVersion: args.calcPolicyVersion,
  });
}

export async function buildRunFingerprint(args: {
  run: unknown;
  traceId?: string;
}): Promise<string> {
  return hashObject({
    run: args.run,
    traceId: args.traceId,
  });
}