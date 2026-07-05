/**
 * ResetPassword
 *
 * Handles two Supabase auth link types that share the same UX:
 *   • type=invite  — new user invited by an admin (needs to set a password)
 *   • type=recovery — existing user who requested a password reset
 *
 * Supabase JS automatically exchanges the #access_token fragment for a
 * session and fires onAuthStateChange.  This page waits for that event,
 * then shows a "set new password" form.
 *
 * After a successful password update the user is navigated to "/" where
 * useOrg will select user.user_metadata.invited_org_id when present.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { validatePassword } from '@/lib/password-policy';
import { Shield, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

type Phase = 'waiting' | 'set-password' | 'saving' | 'done' | 'expired';

export default function ResetPassword() {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [err, setErr]             = useState<string | null>(null);
  const nav = useNavigate();
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Detect whether this page was reached via an invite / recovery link.
    // Supabase appends the token info as a URL hash fragment.
    const hash = window.location.hash;
    const isAuthLink = hash.includes('type=invite') || hash.includes('type=recovery');

    if (!isAuthLink) {
      // Direct navigation with no token — treat as expired / invalid.
      setPhase('expired');
      return;
    }

    // Check for a session that the Supabase client may have already
    // established by processing the hash before this effect ran.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPhase('set-password');
    });

    // Also listen for the auth event fired when the client exchanges the
    // hash token asynchronously.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setPhase('set-password');
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Clear the post-success navigation timer on unmount.
  useEffect(() => () => { if (navTimer.current) clearTimeout(navTimer.current); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    const pwError = validatePassword(password);
    if (pwError) { setErr(pwError); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }

    setPhase('saving');

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErr(error.message);
      setPhase('set-password');
      return;
    }

    setPhase('done');
    // Give the user a moment to read the success message, then navigate.
    // useOrg will automatically prefer user_metadata.invited_org_id.
    navTimer.current = setTimeout(() => nav('/', { replace: true }), 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">

        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          <div className="h-9 w-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-bold">DualPay</div>
            <div className="text-[11px] text-muted-foreground font-mono">Set your password</div>
          </div>
        </div>

        {/* Waiting for session */}
        {phase === 'waiting' && (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Verifying link…</span>
          </div>
        )}

        {/* Password form */}
        {(phase === 'set-password' || phase === 'saving') && (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Choose a strong password to secure your account.
            </p>
            <div>
              <label className="text-xs font-medium">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm"
                autoFocus
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                At least 8 characters with one number or symbol.
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Confirm password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm"
              />
            </div>
            {err && <div className="text-xs text-status-denied">{err}</div>}
            <button
              type="submit"
              disabled={phase === 'saving'}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
            >
              {phase === 'saving' ? 'Setting password…' : 'Set password & continue'}
            </button>
          </form>
        )}

        {/* Success */}
        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-status-paid" />
            <div>
              <div className="text-sm font-semibold">Password set!</div>
              <div className="text-[11px] text-muted-foreground mt-1">Taking you to the dashboard…</div>
            </div>
          </div>
        )}

        {/* Expired / invalid link */}
        {phase === 'expired' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="h-7 w-7 text-status-denied" />
            <div>
              <div className="text-sm font-semibold">Link invalid or expired</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Ask your administrator to resend the invitation.
              </div>
            </div>
            <button
              className="text-xs text-primary underline mt-1"
              onClick={() => nav('/login')}
            >
              Go to sign in →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
