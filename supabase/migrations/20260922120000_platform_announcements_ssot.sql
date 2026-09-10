-- Platform announcements SSOT (homepage modal + /announcements + admin CRUD)

CREATE TABLE IF NOT EXISTS public.platform_announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    content text NOT NULL,
    image_url text NOT NULL,
    image_object_key text,
    link_url text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT platform_announcements_date_range_chk CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_platform_announcements_active_window
    ON public.platform_announcements (is_active, start_date, end_date, priority);

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_public_read ON public.platform_announcements;
CREATE POLICY announcements_public_read ON public.platform_announcements
    FOR SELECT USING (true);

DROP POLICY IF EXISTS announcements_admin_write ON public.platform_announcements;
CREATE POLICY announcements_admin_write ON public.platform_announcements
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

GRANT SELECT ON public.platform_announcements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_announcements TO service_role;

CREATE OR REPLACE FUNCTION public.fn_platform_announcements_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_announcements_touch_updated_at ON public.platform_announcements;
CREATE TRIGGER trg_platform_announcements_touch_updated_at
    BEFORE UPDATE ON public.platform_announcements
    FOR EACH ROW EXECUTE FUNCTION public.fn_platform_announcements_touch_updated_at();

CREATE OR REPLACE FUNCTION public.fn_platform_active_announcements()
RETURNS SETOF public.platform_announcements
LANGUAGE sql
STABLE
AS $$
    SELECT *
    FROM public.platform_announcements pa
    WHERE pa.is_active = true
      AND pa.start_date <= (timezone('Asia/Hong_Kong', now()))::date
      AND pa.end_date >= (timezone('Asia/Hong_Kong', now()))::date
    ORDER BY pa.priority ASC, pa.created_at DESC;
$$;

-- Seed from app/lib/mockAnnouncements.ts (stable UUIDs)
INSERT INTO public.platform_announcements (
    id, title, content, image_url, image_object_key, link_url,
    start_date, end_date, is_active, priority, created_at, updated_at
)
VALUES
    (
        'a1000001-0001-4000-8000-000000000001',
        '🔥 HKCardVault 2026 寶可夢盛夏大促 – 高價評分卡限時免手續費交易！',
        '即日起至 8 月底，凡上架 PSA 10 / BGS 9.5 以上的高價值寶可夢評分卡，平台交易手續費全免！立即把握機會上架您的珍藏寶可夢卡牌。',
        'https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?q=80&w=1200&auto=format&fit=crop',
        NULL,
        '/catalog',
        '2026-07-01',
        '2026-08-31',
        true,
        1,
        '2026-07-01T10:00:00Z',
        '2026-07-01T10:00:00Z'
    ),
    (
        'a1000002-0002-4000-8000-000000000002',
        '🏛️ 獨家代託管升級：專業地下金庫級防潮實體保管庫開放申請',
        'HKCardVault 聯手香港專業收藏級金庫，提供 24/7 恆溫恆濕極致實體保管服務。通過金庫驗證之卡牌可獲得專屬黃金驗證標章並享受優先媒合！',
        'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1200&auto=format&fit=crop',
        NULL,
        '/admin/campaigns',
        '2026-07-15',
        '2026-09-30',
        true,
        2,
        '2026-07-15T09:00:00Z',
        '2026-07-15T09:00:00Z'
    ),
    (
        'a1000003-0003-4000-8000-000000000003',
        '📈 全新「AI 評分行情追蹤系統」正式上線',
        '即時掌握日版 SAR / UR / SR 最新大數據走勢圖表！整合日本與國際拍賣市場成交歷史，為您的投資決策提供精準洞察。',
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop',
        NULL,
        '/catalog',
        '2026-07-20',
        '2026-10-15',
        true,
        3,
        '2026-07-20T14:30:00Z',
        '2026-07-20T14:30:00Z'
    ),
    (
        'a1000004-0004-4000-8000-000000000004',
        '⚡ 舊版「狂歡抽卡積分季」活動結算公告',
        '上一季積分抽獎活動已順利結算，所有獎勵卡牌已全數發放至獲獎者個人 Vault 帳戶中。感謝各位收藏家熱烈參與！',
        'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=1200&auto=format&fit=crop',
        NULL,
        NULL,
        '2026-06-01',
        '2026-06-30',
        true,
        4,
        '2026-06-01T08:00:00Z',
        '2026-06-30T23:59:59Z'
    )
ON CONFLICT (id) DO NOTHING;
