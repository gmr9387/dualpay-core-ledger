import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Shield } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    // Supabase places the recovery token in the URL hash; the client
    // parses it on load and emits a PASSWORD_RECOVERY auth event.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    // Also permit direct entry if a session already exists.
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // Keep the session active — invited users go straight into the app,
    // password-reset users likewise land on the dashboard already signed in.
    nav('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-9 w-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-bold">Set a new password</div>
            <div className="text-[11px] text-muted-foreground font-mono">Minimum 8 characters</div>
          </div>
        </div>
        {!ready ? (
          <div className="text-xs text-muted-foreground">Validating reset link…</div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-medium">New password</label>
              <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium">Confirm password</label>
              <input type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm" />
            </div>
            {err && <div className="text-xs text-status-denied">{err}</div>}
            <button type="submit" disabled={busy}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
