/**
 * Development-only helper: Create or get a test user with org membership.
 * 
 * Use in browser console or programmatically:
 *   import { ensureDevUser } from '@/lib/dev-auth-helper';
 *   const result = await ensureDevUser('test@example.com', 'testpassword', 'analyst');
 *   console.log('Dev user ready:', result);
 * 
 * Then sign in via Supabase Auth UI with that email/password.
 * The user will be automatically added to Demo Organization with the specified role.
 * 
 * DEVELOPMENT ONLY — Do not use in production.
 */

import { supabase } from '@/integrations/supabase/client';

export interface DevUserResult {
  user_id: string;
  org_id: string;
  email: string;
  role: 'analyst' | 'manager' | 'admin' | 'owner';
}

/**
 * Create or get a development user with org membership.
 * 
 * @param email - Email address for the test user
 * @param password - Password for the test user (must be > 6 chars for Supabase)
 * @param role - Role within the org (default: 'analyst')
 * @returns { user_id, org_id, email, role }
 * 
 * @throws If signup/signin fails (other than already-registered)
 */
export async function ensureDevUser(
  email: string,
  password: string,
  role: 'analyst' | 'manager' | 'admin' | 'owner' = 'analyst',
): Promise<DevUserResult> {
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  // 1. Sign up (idempotent; if already registered, we'll get existing user)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  // Ignore "already registered" error; we'll fetch the existing user
  if (authError && !authError.message.includes('already registered')) {
    throw new Error(`Auth error: ${authError.message}`);
  }

  let userId: string;

  // If signup succeeded, use that user ID
  if (authData?.user?.id) {
    userId = authData.user.id;
  } else {
    // Otherwise, try to get the currently logged-in user (from signup redirect)
    const { data: sessionData } = await supabase.auth.getUser();
    if (sessionData?.user?.id) {
      userId = sessionData.user.id;
    } else {
      // As a fallback, attempt a sign-in to get the user
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword(
        { email, password },
      );
      if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`);
      userId = signInData?.user?.id ?? '';
    }
  }

  if (!userId) {
    throw new Error('Failed to get or create user ID');
  }

  // 2. Create or get Demo Organization
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('org_id')
    .eq('name', 'Demo Organization')
    .limit(1);

  if (orgsError) throw new Error(`Orgs query failed: ${orgsError.message}`);

  let orgId: string;

  if (orgs && orgs.length > 0) {
    orgId = orgs[0].org_id;
  } else {
    // Create new Demo Organization (via service_role if needed)
    const { data: newOrg, error: createError } = await supabase
      .from('organizations')
      .insert([{ name: 'Demo Organization' }])
      .select('org_id')
      .single();

    if (createError) throw new Error(`Org creation failed: ${createError.message}`);
    orgId = newOrg.org_id;
  }

  // 3. Add user to org via upsert (idempotent)
  const { error: memberError } = await supabase.from('organization_members').upsert(
    [{ org_id: orgId, user_id: userId, role }],
    { onConflict: 'org_id,user_id' },
  );

  if (memberError) {
    throw new Error(`Membership upsert failed: ${memberError.message}`);
  }

  return {
    user_id: userId,
    org_id: orgId,
    email,
    role,
  };
}
