-- Extend KYC submit RPC: provisional merchant on submit (role + kyc_records.pending + merchant_shops).

CREATE OR REPLACE FUNCTION public.rpc_submit_merchant_kyc_application(
  p_user_id UUID,
  p_application JSONB,
  p_documents JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_status public.kyc_application_status;
  v_application_id UUID;
  v_doc JSONB;
  v_doc_count INTEGER := 0;
  v_shop_name TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '未登入';
  END IF;

  IF p_documents IS NULL OR jsonb_typeof(p_documents) <> 'array' THEN
    RAISE EXCEPTION '文件資料無效，請重新上傳';
  END IF;

  SELECT status INTO v_existing_status
  FROM public.kyc_applications
  WHERE user_id = p_user_id;

  IF FOUND THEN
    IF v_existing_status = 'pending' THEN
      RAISE EXCEPTION '您的申請正在審核中，請耐心等候';
    END IF;

    IF v_existing_status = 'approved' THEN
      RAISE EXCEPTION '您的申請已獲批准，無需再次提交';
    END IF;
  END IF;

  v_shop_name := NULLIF(BTRIM(p_application->>'company_name_en'), '');

  INSERT INTO public.kyc_applications (
    user_id,
    company_name_en,
    company_name_zh,
    br_number,
    company_address,
    company_phone,
    rep_name_en,
    rep_name_zh,
    rep_dob,
    rep_hkid,
    rep_address,
    rep_email,
    rep_phone,
    rep_title,
    bank_name,
    bank_code,
    branch_code,
    bank_account_number,
    bank_account_masked,
    bank_account_holder,
    status,
    reject_reason,
    reviewed_by,
    reviewed_at
  )
  VALUES (
    p_user_id,
    p_application->>'company_name_en',
    NULLIF(p_application->>'company_name_zh', ''),
    p_application->>'br_number',
    p_application->'company_address',
    p_application->>'company_phone',
    p_application->>'rep_name_en',
    NULLIF(p_application->>'rep_name_zh', ''),
    (p_application->>'rep_dob')::date,
    p_application->>'rep_hkid',
    p_application->'rep_address',
    p_application->>'rep_email',
    p_application->>'rep_phone',
    p_application->>'rep_title',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'pending',
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE SET
    company_name_en = EXCLUDED.company_name_en,
    company_name_zh = EXCLUDED.company_name_zh,
    br_number = EXCLUDED.br_number,
    company_address = EXCLUDED.company_address,
    company_phone = EXCLUDED.company_phone,
    rep_name_en = EXCLUDED.rep_name_en,
    rep_name_zh = EXCLUDED.rep_name_zh,
    rep_dob = EXCLUDED.rep_dob,
    rep_hkid = EXCLUDED.rep_hkid,
    rep_address = EXCLUDED.rep_address,
    rep_email = EXCLUDED.rep_email,
    rep_phone = EXCLUDED.rep_phone,
    rep_title = EXCLUDED.rep_title,
    bank_name = NULL,
    bank_code = NULL,
    branch_code = NULL,
    bank_account_number = NULL,
    bank_account_masked = NULL,
    bank_account_holder = NULL,
    status = 'pending',
    reject_reason = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    updated_at = now()
  RETURNING id INTO v_application_id;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documents)
  LOOP
    IF v_doc->>'document_type' IS NULL
       OR v_doc->>'storage_path' IS NULL
       OR v_doc->>'content_type' IS NULL THEN
      RAISE EXCEPTION '文件資料無效，請重新上傳';
    END IF;

    IF v_doc->>'document_type' NOT IN (
      'br_certificate', 'bank_statement', 'rep_id_front', 'rep_id_back'
    ) THEN
      RAISE EXCEPTION '文件類型無效';
    END IF;

    INSERT INTO public.kyc_documents (
      application_id,
      document_type,
      storage_path,
      content_type,
      stripe_file_id
    )
    VALUES (
      v_application_id,
      v_doc->>'document_type',
      v_doc->>'storage_path',
      v_doc->>'content_type',
      NULL
    )
    ON CONFLICT (application_id, document_type) DO UPDATE SET
      storage_path = EXCLUDED.storage_path,
      content_type = EXCLUDED.content_type,
      stripe_file_id = NULL;

    v_doc_count := v_doc_count + 1;
  END LOOP;

  IF v_doc_count <> 4 THEN
    RAISE EXCEPTION '請上傳全部 4 份必要文件';
  END IF;

  -- Provisional merchant: unlock merchant dashboard + dual persona while admin reviews.
  UPDATE public.profiles
  SET role = 'merchant'
  WHERE id = p_user_id;

  INSERT INTO public.kyc_records (merchant_id, kyc_status, verified_at)
  VALUES (p_user_id, 'pending', NULL)
  ON CONFLICT (merchant_id) DO UPDATE SET
    kyc_status = 'pending',
    verified_at = NULL,
    updated_at = now();

  INSERT INTO public.merchant_shops (
    merchant_id,
    shop_name,
    shop_description,
    shop_handle,
    completed_trades_count,
    cancelled_trades_count,
    rating_score,
    shop_rating_score,
    reputation_tag
  )
  VALUES (
    p_user_id,
    COALESCE(v_shop_name, '新認證優質商戶店鋪'),
    '新認證優質商戶店鋪',
    public.generate_merchant_shop_handle(),
    0,
    0,
    0.0,
    0.0,
    jsonb_build_object('core_main_merchant', 1, 'activity_badges', '[]'::jsonb)
  )
  ON CONFLICT (merchant_id) DO UPDATE SET
    shop_name = COALESCE(v_shop_name, public.merchant_shops.shop_name),
    updated_at = now();

  RETURN jsonb_build_object('application_id', v_application_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_merchant_kyc_application(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_merchant_kyc_application(UUID, JSONB, JSONB) TO service_role;
