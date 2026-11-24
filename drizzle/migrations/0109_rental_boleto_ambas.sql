CREATE OR REPLACE FUNCTION public.rental_boleto_prepare(
  _contract_id uuid, _account_id uuid, _competencia text, _snapshot jsonb,
  _total_centavos bigint, _vencimento date, _actor uuid)
RETURNS TABLE(out_id uuid, out_estado text, out_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  acc public.billing_accounts%ROWTYPE;
  live_id uuid;
  live_estado text;
  next_oc integer;
  seu text;
  new_id uuid;
  contract_brand text;
BEGIN
  SELECT * INTO acc FROM public.billing_accounts a WHERE a.id = _account_id;
  IF NOT FOUND OR NOT acc.configurado THEN
    RAISE EXCEPTION 'billing account not configured' USING ERRCODE = '42501';
  END IF;
  IF acc.ambiente = 'producao' AND (NOT acc.emissao_habilitada OR acc.consulta_ok_em IS NULL) THEN
    RAISE EXCEPTION 'production issuance disabled' USING ERRCODE = '42501';
  END IF;
  SELECT c.brand::text INTO contract_brand FROM public.rental_contracts c WHERE c.id = _contract_id;
  IF contract_brand IS NULL
     OR NOT (contract_brand = acc.brand OR (contract_brand = 'ambas' AND acc.brand IN ('cordial','morar'))) THEN
    RAISE EXCEPTION 'contract brand mismatch' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rental_boleto:' || _contract_id::text || ':' || _competencia || ':' || acc.ambiente, 0));
  SELECT b.id, b.estado INTO live_id, live_estado FROM public.rental_boletos b
    WHERE b.contract_id = _contract_id AND b.competencia = _competencia AND b.ambiente = acc.ambiente
      AND b.estado NOT IN ('rejeitado','baixado')
    ORDER BY b.ocorrencia DESC LIMIT 1;
  IF live_id IS NOT NULL THEN
    RETURN QUERY SELECT live_id, live_estado, false;
    RETURN;
  END IF;
  SELECT coalesce(max(b.ocorrencia), 0) + 1 INTO next_oc FROM public.rental_boletos b
    WHERE b.contract_id = _contract_id AND b.competencia = _competencia AND b.ambiente = acc.ambiente;
  seu := public.rental_boleto_seu_numero(_contract_id, _competencia, next_oc);
  INSERT INTO public.rental_boletos (contract_id, account_id, brand, ambiente, competencia, ocorrencia,
    seu_numero, id_titulo_empresa, snapshot, total_centavos, vencimento, created_by)
  VALUES (_contract_id, _account_id, acc.brand, acc.ambiente, _competencia, next_oc,
    seu, seu || replace(_competencia, '-', ''), _snapshot, _total_centavos, _vencimento, _actor)
  RETURNING id INTO new_id;
  INSERT INTO public.rental_boleto_events (boleto_id, de, para, actor, mensagem, detalhe)
  VALUES (new_id, NULL, 'preparando', _actor, 'Boleto preparado',
    jsonb_build_object('vencimento_alterado', coalesce((_snapshot->'vencimento'->>'alterado')::boolean, false),
                       'vencimento_original', _snapshot->'vencimento'->>'original',
                       'marca_conta', acc.brand,
                       'marca_contrato', contract_brand));
  RETURN QUERY SELECT new_id, 'preparando'::text, true;
END $$;