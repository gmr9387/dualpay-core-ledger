import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Shield } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg('If that email exists, a reset link has been sent.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-9 w-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-bold">Reset your password</div>
            <div className="text-[11px] text-muted-foreground font-mono">We'll email a secure link</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm" />
          </div>
          {err && <div className="text-xs text-status-denied">{err}</div>}
          {msg && <div className="text-xs text-status-paid">{msg}</div>}
          <button type="submit" disabled={busy}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/login" className="text-primary font-medium">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
