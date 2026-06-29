import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Shield } from 'lucide-react';
import { validatePassword } from '@/lib/password-policy';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    const pwError = validatePassword(password);
    if (pwError) { setErr(pwError); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (data.session) {
      nav('/', { replace: true });
    } else {
      setMsg('Check your email to confirm your account.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-9 w-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-bold">Create your account</div>
            <div className="text-[11px] text-muted-foreground font-mono">Provisions your organization</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium">Password</label>
            <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm" />
            <div className="mt-1 text-[10px] text-muted-foreground">At least 8 characters with one number or symbol.</div>
          </div>
          {err && <div className="text-xs text-status-denied">{err}</div>}
          {msg && <div className="text-xs text-status-paid">{msg}</div>}
          <button type="submit" disabled={busy}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account? <Link to="/login" className="text-primary font-medium">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
