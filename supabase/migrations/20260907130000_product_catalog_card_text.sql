-- Store official card text (abilities, attacks, rules) for marketplace SSOT alignment.
ALTER TABLE public.product_catalog
  ADD COLUMN IF NOT EXISTS card_text jsonb;

COMMENT ON COLUMN public.product_catalog.card_text IS
  'Official card text payload: abilities, attacks, special_rules, weakness, resistance, retreat.';
