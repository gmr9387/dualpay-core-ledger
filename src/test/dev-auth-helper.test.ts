import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing the module under test
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
    },
    from: vi.fn(),
  },
}));

import { ensureDevUser } from '@/lib/dev-auth-helper';

describe('ensureDevUser password validation', () => {
  it('throws when password is fewer than 8 characters', async () => {
    await expect(ensureDevUser('a@b.com', 'abc1!')).rejects.toThrow(
      'Password must be at least 8 characters',
    );
  });

  it('throws when password has no number or symbol', async () => {
    await expect(ensureDevUser('a@b.com', 'abcdefgh')).rejects.toThrow(
      'Password must contain at least one number or symbol',
    );
  });

  it('throws for exactly 7 characters with a symbol', async () => {
    await expect(ensureDevUser('a@b.com', 'abcde1!')).rejects.toThrow(
      'Password must be at least 8 characters',
    );
  });

  it('does not throw for valid password (8 chars with number)', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ org_id: 'org-1' }], error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: 'user-1' }, session: null },
      error: null,
    } as any);
    vi.mocked(supabase.from).mockReturnValue(fromMock as any);

    await expect(ensureDevUser('a@b.com', 'abcdefg1')).resolves.toMatchObject({
      user_id: 'user-1',
      email: 'a@b.com',
    });
  });

  it('does not throw for valid password (8 chars with symbol)', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const fromMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ org_id: 'org-1' }], error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: 'user-2' }, session: null },
      error: null,
    } as any);
    vi.mocked(supabase.from).mockReturnValue(fromMock as any);

    await expect(ensureDevUser('a@b.com', 'abcdefg!')).resolves.toMatchObject({
      user_id: 'user-2',
    });
  });
});
