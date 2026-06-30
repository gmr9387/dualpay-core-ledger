/**
 * OrgSettings — Phase 4B
 *
 * Clinic configuration: identity, operational defaults, and
 * security posture flags.  Requires admin or owner role.
 */
import { useEffect, useState } from 'react';
import { useOrgSettings, type OrgSettingsUpdate } from '@/hooks/use-org-settings';
import { RequireRole } from '@/components/auth/RequireRole';
import { PageHeader, ScrollBody } from '@/components/clarity/primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Save, Building2, Clock, ShieldCheck, Loader2 } from 'lucide-react';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
];

export default function OrgSettings() {
  return (
    <RequireRole min="admin">
      <OrgSettingsInner />
    </RequireRole>
  );
}

function OrgSettingsInner() {
  const { data: settings, isLoading, save } = useOrgSettings();

  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [npi, setNpi] = useState('');
  const [taxId, setTaxId] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [defaultSlaDays, setDefaultSlaDays] = useState('30');
  const [mfaRequired, setMfaRequired] = useState(false);

  // Populate form from loaded settings.
  useEffect(() => {
    if (!settings) return;
    setClinicName(settings.clinic_name ?? '');
    setAddress(settings.address ?? '');
    setPhone(settings.phone ?? '');
    setNpi(settings.npi ?? '');
    setTaxId(settings.tax_id ?? '');
    setTimezone(settings.timezone);
    setDefaultSlaDays(String(settings.default_sla_days));
    setMfaRequired(settings.mfa_required);
  }, [settings]);

  const handleSave = async () => {
    const sla = parseInt(defaultSlaDays, 10);
    if (isNaN(sla) || sla < 1) {
      toast({ title: 'Default SLA days must be a positive number', variant: 'destructive' });
      return;
    }
    const updates: OrgSettingsUpdate = {
      clinic_name: clinicName || null,
      address: address || null,
      phone: phone || null,
      npi: npi || null,
      tax_id: taxId || null,
      timezone,
      default_sla_days: sla,
      mfa_required: mfaRequired,
    };
    try {
      await save.mutateAsync(updates);
      toast({ title: 'Settings saved' });
    } catch (e) {
      toast({ title: 'Failed to save settings', description: String(e), variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Organization Settings"
        subtitle="Configure clinic identity, operational defaults, and security settings."
        actions={
          <Button onClick={handleSave} disabled={save.isPending} size="sm">
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save settings
          </Button>
        }
      />
      <ScrollBody>
        <div className="max-w-2xl mx-auto p-5 space-y-5">
          {/* Organization identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Organization Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Clinic name" hint="Legal or operating name">
                <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="Sunrise Family Medicine" className="h-8 text-[12.5px]" />
              </Field>
              <Field label="Address" hint="Street, City, State ZIP">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Detroit, MI 48201" className="h-8 text-[12.5px]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(313) 555-0100" className="h-8 text-[12.5px]" />
                </Field>
                <Field label="NPI" hint="10-digit National Provider Identifier">
                  <Input value={npi} onChange={(e) => setNpi(e.target.value)} placeholder="1234567890" className="h-8 text-[12.5px] font-mono" maxLength={10} />
                </Field>
              </div>
              <Field label="Tax ID / EIN" hint="Federal Employer Identification Number">
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="12-3456789" className="h-8 text-[12.5px] font-mono" />
              </Field>
            </CardContent>
          </Card>

          {/* Operational settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Operational Defaults
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Timezone" hint="Used for SLA calculations and report timestamps">
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Default SLA (days)" hint="Days until a claim is flagged as overdue">
                <Input
                  type="number" min="1" max="365"
                  value={defaultSlaDays} onChange={(e) => setDefaultSlaDays(e.target.value)}
                  className="h-8 text-[12.5px] font-mono w-28"
                />
              </Field>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[12.5px] font-medium">MFA readiness flag</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Mark this org as requiring MFA for all members. Enforcement is managed through your identity provider.
                  </p>
                </div>
                <Switch checked={mfaRequired} onCheckedChange={setMfaRequired} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save settings
            </Button>
          </div>
        </div>
      </ScrollBody>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10.5px] font-semibold uppercase tracking-wide">{label}</Label>
      {hint && <p className="text-[10.5px] text-muted-foreground mb-1">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}
