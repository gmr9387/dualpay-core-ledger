import { supabase } from '@/integrations/supabase/client';
import { saveClaim } from '@/data/repository';
import type { Claim } from '@/types/claim';

export interface IntegrationContext {
  orgId: string;
  userId: string;
  secondaryUserId?: string;
  claimId?: string;
  cleanup: () => Promise<void>;
}

function randomUuid(): string {
  return crypto.randomUUID();
}

function buildClaim(claimId: string): Claim {
  return {
    claim_id: claimId,
    member_id: `MEM-${randomUuid().slice(0, 8)}`,
    provider_npi: '1234567890',
    provider_name: 'Integration Test Provider',
    claim_type: 'professional',
    received_date: new Date().toISOString(),
    service_date_from: new Date().toISOString().slice(0, 10),
    service_date_to: new Date().toISOString().slice(0, 10),
    total_billed: 500000,
    lines: [{
      line_id: `LINE-${randomUuid().slice(0, 8)}`,
      claim_id: claimId,
      service_date: new Date().toISOString().slice(0, 10),
      claim_line_number: 1,
      procedure_code: '99213',
      diagnosis_codes: ['J06.9'],
      billed_amount: 500000,
      units: 1,
      place_of_service: '11',
    }],
    ohi_indicators: [],
    status: 'RECEIVED',
  };
}

interface AuthIdentity {
  userId: string;
  email: string;
  password: string;
}

async function ensureAuthenticatedUser(suite: string): Promise<AuthIdentity> {
  await supabase.auth.signOut();

  const email = `${suite}-${randomUuid()}@example.invalid`;
  const password = `T3st!${randomUuid()}`;
  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.data.user?.id && signUp.data.session) {
    return { userId: signUp.data.user.id, email, password };
  }

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user?.id) {
    throw signIn.error ?? signUp.error ?? new Error('Unable to authenticate integration test user');
  }
  return { userId: signIn.data.user.id, email, password };
}

export async function setupIntegrationContext(options: {
  suite: string;
  withClaimId?: string;
  withSecondaryUser?: boolean;
}): Promise<IntegrationContext> {
  const primary = await ensureAuthenticatedUser(options.suite);
  const userId = primary.userId;
  let secondaryUserId: string | undefined;
  const orgName = `Integration ${options.suite} ${randomUuid().slice(0, 8)}`;

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name: orgName })
    .select('org_id')
    .single();
  if (orgErr || !org) throw orgErr ?? new Error('Failed to create integration org');

  const orgId = org.org_id;
  const { error: memberErr } = await supabase
    .from('organization_members')
    .upsert({ org_id: orgId, user_id: userId, role: 'owner' }, { onConflict: 'org_id,user_id' });
  if (memberErr) throw memberErr;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('clarity:current_org_id', orgId);
  }

  if (options.withClaimId) {
    await saveClaim(buildClaim(options.withClaimId), orgId);
  }

  if (options.withSecondaryUser) {
    const email = `${options.suite}-secondary-${randomUuid()}@example.invalid`;
    const password = `T3st!${randomUuid()}`;
    const signUp = await supabase.auth.signUp({ email, password });
    secondaryUserId = signUp.data.user?.id;
    await supabase.auth.signInWithPassword({
      email: primary.email,
      password: primary.password,
    });
  }

  const cleanup = async () => {
    const tables = [
      'ops_events',
      'claim_assignments',
      'recovery_outcomes',
      'replay_ledger_events',
      'replay_records',
      'idempotency_keys',
      'import_exceptions',
      'remittance_batches',
      'import_batches',
      'field_mappings',
      'claims',
      'organization_members',
    ] as const;

    for (const table of tables) {
      await supabase.from(table).delete().eq('org_id', orgId);
    }
    await supabase.from('organizations').delete().eq('org_id', orgId);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('clarity:current_org_id');
    }
    await supabase.auth.signOut();
  };

  return { orgId, userId, secondaryUserId, claimId: options.withClaimId, cleanup };
}
