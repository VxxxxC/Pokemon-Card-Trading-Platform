-- Home banner vs announcements display surfaces on platform_announcements

ALTER TABLE public.platform_announcements
    ADD COLUMN IF NOT EXISTS show_on_home_banner boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS show_in_announcements boolean NOT NULL DEFAULT true;

ALTER TABLE public.platform_announcements
    DROP CONSTRAINT IF EXISTS platform_announcements_display_surface_chk;

ALTER TABLE public.platform_announcements
    ADD CONSTRAINT platform_announcements_display_surface_chk
    CHECK (show_on_home_banner OR show_in_announcements);

UPDATE public.platform_announcements
SET
    show_in_announcements = true,
    show_on_home_banner = false
WHERE show_in_announcements IS DISTINCT FROM true
   OR show_on_home_banner IS DISTINCT FROM false;

CREATE INDEX IF NOT EXISTS idx_platform_announcements_home_banner
    ON public.platform_announcements (is_active, start_date, end_date, priority)
    WHERE show_on_home_banner = true;

CREATE OR REPLACE FUNCTION public.fn_platform_active_announcements()
RETURNS SETOF public.platform_announcements
LANGUAGE sql
STABLE
AS $$
    SELECT *
    FROM public.platform_announcements pa
    WHERE pa.is_active = true
      AND pa.show_in_announcements = true
      AND pa.start_date <= (timezone('Asia/Hong_Kong', now()))::date
      AND pa.end_date >= (timezone('Asia/Hong_Kong', now()))::date
    ORDER BY pa.priority ASC, pa.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.fn_platform_home_banners()
RETURNS SETOF public.platform_announcements
LANGUAGE sql
STABLE
AS $$
    SELECT *
    FROM public.platform_announcements pa
    WHERE pa.is_active = true
      AND pa.show_on_home_banner = true
      AND pa.start_date <= (timezone('Asia/Hong_Kong', now()))::date
      AND pa.end_date >= (timezone('Asia/Hong_Kong', now()))::date
    ORDER BY pa.priority ASC, pa.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_platform_active_announcements() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_home_banners() TO anon, authenticated;
