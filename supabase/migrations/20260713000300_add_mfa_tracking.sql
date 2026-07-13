BEGIN;

CREATE TABLE IF NOT EXISTS public.user_security_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_enabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_security_settings FROM PUBLIC;
REVOKE ALL ON public.user_security_settings FROM anon;

GRANT SELECT ON public.user_security_settings TO authenticated;
GRANT ALL ON public.user_security_settings TO service_role;

CREATE POLICY user_security_settings_select_self
ON public.user_security_settings
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

COMMENT ON TABLE public.user_security_settings IS
'Tracks security-control status for authenticated users. MFA enforcement must rely on verified Supabase Auth AAL claims, not this table alone.';

COMMENT ON COLUMN public.user_security_settings.mfa_enabled IS
'Administrative tracking field reflecting verified MFA enrollment status.';

COMMENT ON COLUMN public.user_security_settings.mfa_enabled_at IS
'Timestamp when verified MFA enrollment was recorded.';

COMMIT;