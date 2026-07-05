/**
 * invite-member — Supabase-native invite edge function.
 *
 * Sends a Supabase invite email so the invited user lands on
 * /reset-password (not /login) and can set their password before
 * being joined to the org.  The handle_new_user_org trigger
 * (or the org_member upsert below) takes care of the membership row.
 *
 * Body: { email: string; role: string; org_id: string; redirect_to?: string }
 * Requires: authenticated caller with manager/admin/owner role in org_id.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const { email, role, org_id, redirect_to } = await req.json() as {
      email: string; role: string; org_id: string; redirect_to?: string;
    };

    if (!email || !role || !org_id) return json({ error: 'email, role, and org_id are required' }, 400);

    // Verify the caller has manager+ role in the requested org.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: 'Unauthorized' }, 401);

    const { data: membership } = await userClient
      .from('organization_members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', caller.id)
      .maybeSingle();

    if (!membership || !['manager', 'admin', 'owner'].includes(membership.role)) {
      return json({ error: 'Insufficient permissions' }, 403);
    }

    // Build the redirect URL.  Supabase appends #access_token=...&type=invite.
    const redirectTo = redirect_to ?? `${new URL(req.url).origin}/reset-password`;

    // Admin client — service role bypasses RLS.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Send Supabase-native invite email.
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { invited_org_id: org_id, invited_role: role },
      redirectTo,
    });

    if (inviteError) return json({ error: inviteError.message }, 400);

    // Upsert org membership now so it exists even before password is set.
    // The handle_new_user_org trigger also runs on first sign-in; this is
    // a belt-and-suspenders idempotent write.
    await adminClient
      .from('organization_members')
      .upsert(
        { org_id, user_id: inviteData.user.id, role },
        { onConflict: 'org_id,user_id' },
      );

    // Record the invitation for the OrgTeam history panel.
    const { data: inv } = await adminClient
      .from('invitations')
      .insert({ org_id, email, role, created_by: caller.id, status: 'pending' })
      .select('*')
      .maybeSingle();

    return json({ ok: true, invite: inv });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
