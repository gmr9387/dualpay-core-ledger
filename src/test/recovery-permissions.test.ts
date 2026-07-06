import { describe, expect, it } from 'vitest';
import { can } from '@/lib/role-permissions';

describe('recovery write permissions', () => {
  it('viewer cannot see write actions', () => {
    expect(can.edit('viewer')).toBe(false);
  });

  it('analyst can see write actions', () => {
    expect(can.edit('analyst')).toBe(true);
  });
});
