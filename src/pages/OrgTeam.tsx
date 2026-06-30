/**
 * OrgTeam — Phase 4B
 *
 * Team management: invite new staff, view pending invitations,
 * manage user profiles and roles.
 * Requires manager or above.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/use-org';
import { useAuth } from '@/hooks/use-auth';
import { useInvitations } from '@/hooks/use-invitations';
import { useOrgMembers } from '@/hooks/use-org-members';
import { RequireRole } from '@/components/auth/RequireRole';
import { PageHeader, ScrollBody, Panel, EmptyState } from '@/components/clarity/primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { appendOpsEvent } from '@/lib/ops-events';
import {
  UserPlus, Mail, RefreshCw, XCircle, Users, Edit2, Check, X,
} from 'lucide-react';

const ROLES = [
  { value: 'viewer',  label: 'Viewer' },
  { value: 'analyst', label: 'Biller' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin',   label: 'Admin' },
];

const STATUS_TONE: Record<string, string> = {
  pending:  'bg-status-pending/15 text-status-pending border-status-pending/30',
  accepted: 'bg-status-paid/15 text-status-paid border-status-paid/25',
  expired:  'bg-muted text-muted-foreground border-border',
  revoked:  'bg-status-denied/10 text-status-denied border-status-denied/20',
};

export default function OrgTeam() {
  return (
    <RequireRole min="manager">
      <OrgTeamInner />
    </RequireRole>
  );
}

function OrgTeamInner() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const orgId = currentOrg?.org_id ?? null;

  const { data: invites = [], isLoading: invLoading, create: createInvite, revoke: revokeInvite } = useInvitations();
  const { data: members = [], isLoading: membLoading, refetch: refetchMembers } = useOrgMembers();

  // ─── Invite form ───────────────────────────────────────────────────
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState('analyst');
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!invEmail.trim()) return;
    setInviting(true);
    try {
      const inv = await createInvite.mutateAsync({ email: invEmail.trim(), role: invRole });
      await appendOpsEvent({
        kind: 'invitation_created',
        org_id: orgId ?? '',
        summary: `Invitation sent to ${invEmail.trim()} (${invRole})`,
        payload: { invite_id: inv.invite_id, email: inv.email, role: inv.role },
      });
      const acceptUrl = `${window.location.origin}/accept-invite?token=${inv.token}`;
      toast({
        title: 'Invitation created',
        description: `Send this link to ${invEmail.trim()}: ${acceptUrl}`,
      });
      setInvEmail('');
    } catch (e) {
      toast({ title: 'Failed to create invitation', description: String(e), variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (invite_id: string) => {
    try {
      await revokeInvite.mutateAsync(invite_id);
      toast({ title: 'Invitation revoked' });
    } catch (e) {
      toast({ title: 'Failed to revoke', description: String(e), variant: 'destructive' });
    }
  };

  // Copy invite link to clipboard.
  const copyLink = (token: string) => {
    const url = `${window.location.origin}/accept-invite?token=${token}`;
    navigator.clipboard.writeText(url).then(() => toast({ title: 'Link copied to clipboard' }));
  };

  const pending = invites.filter(i => i.status === 'pending');
  const accepted = invites.filter(i => i.status === 'accepted');

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Team Management"
        subtitle={`Invite staff to ${currentOrg?.name ?? 'your organization'} and manage member profiles.`}
        actions={
          <Button size="sm" variant="outline" onClick={() => refetchMembers()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        }
      />
      <ScrollBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 p-5">
          {/* ─ Invite form ─ */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> Invite team member</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-[10.5px]">Email address</Label>
                  <Input
                    type="email"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    placeholder="biller@clinic.com"
                    className="h-8 text-[12.5px] mt-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  />
                </div>
                <div>
                  <Label className="text-[10.5px]">Role</Label>
                  <Select value={invRole} onValueChange={setInvRole}>
                    <SelectTrigger className="h-8 text-[12.5px] mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={inviting || !invEmail.trim()}
                  onClick={handleInvite}
                  size="sm"
                >
                  <Mail className="h-3.5 w-3.5 mr-1.5" />
                  {inviting ? 'Sending…' : 'Create invitation'}
                </Button>
                <p className="text-[10.5px] text-muted-foreground">
                  An invite link will be generated. Share it with the staff member — it expires in 7 days.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Invitation stats</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded border p-2">
                  <div className="text-2xl font-semibold">{pending.length}</div>
                  <div className="text-[10.5px] text-muted-foreground">Pending</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-2xl font-semibold">{accepted.length}</div>
                  <div className="text-[10.5px] text-muted-foreground">Accepted</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─ Right column ─ */}
          <div className="lg:col-span-2 space-y-4">
            {/* Active roster */}
            <Panel title={`Active Members (${members.length})`} dense>
              {membLoading ? (
                <div className="p-4 text-[12px] text-muted-foreground">Loading…</div>
              ) : members.length === 0 ? (
                <div className="p-6"><EmptyState title="No members yet" body="Invite staff to get started." icon={<Users className="h-5 w-5" />} /></div>
              ) : (
                <MembersList members={members} orgId={orgId ?? ''} userId={user?.id ?? ''} />
              )}
            </Panel>

            {/* Pending invitations */}
            <Panel title={`Pending Invitations (${pending.length})`} dense>
              {invLoading ? (
                <div className="p-4 text-[12px] text-muted-foreground">Loading…</div>
              ) : pending.length === 0 ? (
                <div className="p-4 text-[12px] text-muted-foreground">No pending invitations.</div>
              ) : (
                <div className="divide-y">
                  <div className="grid grid-cols-[1fr_80px_90px_80px_80px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                    <span>Email</span><span>Role</span><span>Status</span><span>Expires</span><span className="text-right">Actions</span>
                  </div>
                  {pending.map(inv => (
                    <div key={inv.invite_id} className="grid grid-cols-[1fr_80px_90px_80px_80px] gap-3 items-center px-4 py-2.5 text-[12px]">
                      <span className="font-mono text-foreground truncate">{inv.email}</span>
                      <span className="text-muted-foreground capitalize">{ROLES.find(r => r.value === inv.role)?.label ?? inv.role}</span>
                      <span className={`pill border ${STATUS_TONE[inv.status] ?? ''}`}>{inv.status}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{new Date(inv.expires_at).toLocaleDateString()}</span>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyLink(inv.token)} title="Copy invite link">
                          <Mail className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-status-denied" onClick={() => handleRevoke(inv.invite_id)} title="Revoke">
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* All invitations (history) */}
            {invites.filter(i => i.status !== 'pending').length > 0 && (
              <Panel title="Invitation History" dense>
                <div className="divide-y">
                  <div className="grid grid-cols-[1fr_80px_90px_100px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                    <span>Email</span><span>Role</span><span>Status</span><span>Date</span>
                  </div>
                  {invites.filter(i => i.status !== 'pending').map(inv => (
                    <div key={inv.invite_id} className="grid grid-cols-[1fr_80px_90px_100px] gap-3 items-center px-4 py-2.5 text-[12px]">
                      <span className="font-mono text-foreground truncate">{inv.email}</span>
                      <span className="text-muted-foreground capitalize">{ROLES.find(r => r.value === inv.role)?.label ?? inv.role}</span>
                      <span className={`pill border ${STATUS_TONE[inv.status] ?? ''}`}>{inv.status}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {inv.accepted_at ? new Date(inv.accepted_at).toLocaleDateString() : new Date(inv.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Members list with inline profile editing
// ─────────────────────────────────────────────────────────────────────────────

interface MembersListProps {
  members: { user_id: string; role: string; display_name: string; first_name?: string | null; last_name?: string | null }[];
  orgId: string;
  userId: string;
}

function MembersList({ members, orgId, userId }: MembersListProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');

  const startEdit = (m: MembersListProps['members'][number]) => {
    setEditing(m.user_id);
    setFname(m.first_name ?? '');
    setLname(m.last_name ?? '');
  };

  const save = useMutation({
    mutationFn: async ({ uid, firstName, lastName }: { uid: string; firstName: string; lastName: string }) => {
      const display = [firstName, lastName].filter(Boolean).join(' ') || null;
      const { error } = await supabase
        .from('user_profiles')
        .upsert(
          { user_id: uid, org_id: orgId, first_name: firstName || null, last_name: lastName || null, display_name: display },
          { onConflict: 'user_id,org_id' },
        );
      if (error) throw new Error(error.message);
      await appendOpsEvent({
        kind: 'profile_updated',
        org_id: orgId,
        summary: `Profile updated for user ${uid.slice(0, 8)}`,
        payload: { target_user_id: uid },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members'] });
      setEditing(null);
    },
  });

  return (
    <div className="divide-y">
      <div className="grid grid-cols-[1fr_1fr_80px_60px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
        <span>Name</span><span>User ID</span><span>Role</span><span className="text-right">Edit</span>
      </div>
      {members.map(m => (
        <div key={m.user_id} className="px-4 py-2.5 text-[12px]">
          {editing === m.user_id ? (
            <div className="flex items-center gap-2">
              <Input
                value={fname} onChange={(e) => setFname(e.target.value)}
                placeholder="First name" className="h-7 text-[12px] flex-1"
              />
              <Input
                value={lname} onChange={(e) => setLname(e.target.value)}
                placeholder="Last name" className="h-7 text-[12px] flex-1"
              />
              <Button size="icon" className="h-7 w-7" variant="outline"
                onClick={() => save.mutate({ uid: m.user_id, firstName: fname, lastName: lname })}
                disabled={save.isPending}
              ><Check className="h-3.5 w-3.5" /></Button>
              <Button size="icon" className="h-7 w-7" variant="ghost"
                onClick={() => setEditing(null)}
              ><X className="h-3.5 w-3.5" /></Button>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_1fr_80px_60px] gap-3 items-center">
              <span className="font-medium text-foreground truncate">{m.display_name}</span>
              <span className="font-mono text-muted-foreground text-[11px]">{m.user_id.slice(0, 8)}…</span>
              <Badge variant="outline" className="font-mono text-[10px] w-fit">
                {ROLES.find(r => r.value === m.role)?.label ?? m.role}
              </Badge>
              <div className="flex justify-end">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(m)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
