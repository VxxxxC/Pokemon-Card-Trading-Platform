-- DB-H-02 follow-up: heartbeat columns were omitted from column-level UPDATE grants.
-- Authenticated users may update their own last_active_at via touchUserLastActive.

GRANT UPDATE (last_active_at, updated_at) ON public.profiles TO authenticated;
