BEGIN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_mfa_enabled
ON public.profiles (mfa_enabled);

COMMENT ON COLUMN public.profiles.mfa_enabled IS
'Indicates whether the user has completed MFA enrollment.';

COMMENT ON COLUMN public.profiles.mfa_enabled_at IS
'Timestamp when MFA was enabled.';

COMMIT;