
ALTER TABLE public.underpayment_disputes
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS service_date date;

UPDATE public.underpayment_disputes
   SET dedupe_key = claim_id || '|' || COALESCE(contract_id::text, 'none')
                    || '|' || variance_amount_cents::text
                    || '|' || COALESCE(service_date::text, 'none')
 WHERE dedupe_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS underpayment_disputes_org_dedupe_uidx
  ON public.underpayment_disputes (org_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
