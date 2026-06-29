/**
 * AcceptInvite — Phase 4B
 *
 * Landing page for invitation acceptance.
 * Reads the ?token= query param, validates the invitation,
 * and — once authenticated — joins the user to the org.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { getInvitationByToken, acceptInvitation, type Invitation } from '@/hooks/use-invitations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertTriangle, Shield } from 'lucide-react';

type Phase = 'loading' | 'invalid' | 'expired' | 'already_accepted' | 'login_required' | 'ready' | 'accepting' | 'done' | 'error';

const ROLE_LABEL: Record<string, string> = {
  viewer: 'Viewer',
  analyst: 'Biller',
  manager: 'Manager',
  admin: 'Admin',
  owner: 'Owner',
};

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [orgName, setOrgName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

  // Load invitation details.
  useEffect(() => {
    if (!token) { setPhase('invalid'); return; }
    (async () => {
      const inv = await getInvitationByToken(token);
      if (!inv) { setPhase('invalid'); return; }
      if (inv.status === 'accepted') { setPhase('already_accepted'); setInvite(inv); return; }
      if (inv.status !== 'pending' || new Date(inv.expires_at) < new Date()) {
        setPhase('expired'); setInvite(inv); return;
      }
      setInvite(inv);
      // Load org name.
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('org_id', inv.org_id)
        .maybeSingle();
      setOrgName(org?.name ?? 'the organization');
      setPhase(user ? 'ready' : 'login_required');
    })();
  }, [token, user]);

  // Once the user logs in (or was already logged in), advance to ready.
  useEffect(() => {
    if (user && phase === 'login_required') setPhase('ready');
  }, [user, phase]);

  const handleAccept = async () => {
    if (!user || !invite) return;
    setPhase('accepting');
    const result = await acceptInvitation(invite.token, user.id);
    if (result.ok) {
      setPhase('done');
    } else {
      setErrorMsg(result.error ?? 'Unknown error');
      setPhase('error');
    }
  };

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-sidebar-primary/15 border border-sidebar-primary/30 flex items-center justify-center mb-3">
            <Shield className="h-6 w-6 text-sidebar-primary" />
          </div>
          <CardTitle className="text-xl">DualPay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === 'loading' && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Verifying invitation…
            </div>
          )}

          {phase === 'invalid' && (
            <StatusCard icon={<AlertTriangle className="h-5 w-5 text-status-denied" />} title="Invalid invitation" tone="denied">
              This invitation link is not valid or does not exist.
            </StatusCard>
          )}

          {phase === 'expired' && (
            <StatusCard icon={<AlertTriangle className="h-5 w-5 text-status-denied" />} title="Invitation expired or revoked" tone="denied">
              This invitation has expired or was revoked. Ask your manager to send a new one.
            </StatusCard>
          )}

          {phase === 'already_accepted' && (
            <StatusCard icon={<CheckCircle2 className="h-5 w-5 text-status-paid" />} title="Already accepted" tone="paid">
              This invitation has already been accepted.{' '}
              <button className="text-primary underline" onClick={() => navigate('/')}>Go to dashboard →</button>
            </StatusCard>
          )}

          {phase === 'login_required' && invite && (
            <div className="space-y-4">
              <InviteDetails invite={invite} orgName={orgName} />
              <p className="text-[12.5px] text-muted-foreground text-center">
                You need to sign in (or create an account) to accept this invitation.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => navigate(`/login?redirect=/accept-invite?token=${token}`)}
                >
                  Sign in
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(`/signup?redirect=/accept-invite?token=${token}`)}
                >
                  Create account
                </Button>
              </div>
            </div>
          )}

          {phase === 'ready' && invite && (
            <div className="space-y-4">
              <InviteDetails invite={invite} orgName={orgName} />
              <p className="text-[12.5px] text-muted-foreground">
                Accepting will add you to <span className="font-semibold">{orgName}</span> as a{' '}
                <span className="font-semibold">{ROLE_LABEL[invite.role] ?? invite.role}</span>.
              </p>
              <Button className="w-full" onClick={handleAccept}>
                Accept invitation
              </Button>
            </div>
          )}

          {phase === 'accepting' && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Joining organization…
            </div>
          )}

          {phase === 'done' && invite && (
            <StatusCard icon={<CheckCircle2 className="h-5 w-5 text-status-paid" />} title="Welcome aboard!" tone="paid">
              You've joined <strong>{orgName}</strong> as a{' '}
              <strong>{ROLE_LABEL[invite.role] ?? invite.role}</strong>.{' '}
              <button className="text-primary underline" onClick={() => navigate('/')}>
                Go to dashboard →
              </button>
            </StatusCard>
          )}

          {phase === 'error' && (
            <StatusCard icon={<AlertTriangle className="h-5 w-5 text-status-denied" />} title="Something went wrong" tone="denied">
              {errorMsg}
            </StatusCard>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InviteDetails({ invite, orgName }: { invite: Invitation; orgName: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-[12.5px]">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Organization</span>
        <span className="font-semibold">{orgName}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Invited as</span>
        <span className="font-semibold">{ROLE_LABEL[invite.role] ?? invite.role}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Sent to</span>
        <span className="font-mono">{invite.email}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Expires</span>
        <span className="font-mono">{new Date(invite.expires_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

function StatusCard({
  icon, title, tone = '', children,
}: { icon: React.ReactNode; title: string; tone?: string; children: React.ReactNode }) {
  const bg = tone === 'paid' ? 'bg-status-paid/5 border-status-paid/20' : tone === 'denied' ? 'bg-status-denied/5 border-status-denied/20' : 'bg-muted/40 border-border';
  return (
    <div className={`rounded-lg border p-4 space-y-2 ${bg}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-semibold text-[14px]">{title}</span>
      </div>
      <p className="text-[12.5px] text-muted-foreground">{children}</p>
    </div>
  );
}
