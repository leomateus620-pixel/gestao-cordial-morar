# Vistoria: transcrição dos relatos de voz + excluir/regravar áudio

## Causa raiz (confirmada só por leitura)
1. `voice.server.ts` `voiceStatus()` exige `LOVABLE_API_KEY` **e** `VISTORIA_VOZ_ATIVA === "true"`. No servidor: `LOVABLE_API_KEY` existe (gerenciada); `VISTORIA_VOZ_ATIVA` **não existe**. Logo `transcribe.ready=false`.
2. `inspection-workspace.tsx:107` calcula `voiceReady=false` e passa para `useLocalQueue` → `use-inspection.ts:211` nunca chama `transcribeNote`; `notes-editor.tsx:262` desativa o botão ("Transcrição ainda indisponível").
3. Quando chamado, `use-inspection.ts:213` descarta erro com `.catch(() => undefined)`; não há estado de falha no banco (CHECK só aceita `pendente_transcricao/transcrito/revisado/descartado`).
4. `voice.functions.ts:40` usa nome do caminho ou `relato.wav`, e tipo `audio/wav` por reserva, sem olhar o tipo real.
5. Notas 4925cc2c (5,0 s) e e0c31bfc (3,7 s): `voz`, `audio/wav`, `pendente_transcricao`, revisão 1.
6. Gateway: `openai/gpt-transcribe` e `openai/gpt-6-astra` existem no catálogo (sem chamada paga).

## Tema 1 — Transcrição
**Ativação:** `ready = hasKey && process.env.VISTORIA_VOZ_ATIVA !== "false"`. GPT-Live continua desligado. `missing` só aparece para admin.

**Formatos:** novo `audio-format.ts` (puro): mapa mime→extensão (`audio/wav|x-wav→.wav`, `audio/webm(;codecs=opus)→.webm`, `audio/mp4|x-m4a|aac→.m4a`, `audio/ogg→.ogg`); mime vem da nota, depois do blob, depois da extensão do caminho; nome enviado `relato.<ext>`. Em `media-client.ts`/`use-inspection.ts` a extensão do caminho de envio passa a seguir o mime real (hoje sempre `.wav`).

**WAV longo:** novo `wav-split.ts` (puro): lê cabeçalho RIFF/`fmt `/`data`, divide em segmentos ≤ 24 MB alinhados a `blockAlign`, reescreve cabeçalho de 44 bytes por segmento; transcrição em ordem, texto concatenado com espaço. Outros formatos > 25 MB: recusa "Áudio muito longo para transcrever. Grave em partes menores." Limite máximo aceito 60 MB.

**Chamadas:** tempo limite generoso por chamada (5 min transcrição por segmento, 2 min organização) e leitura de resposta limitada (SSE até 1 MB; erro até 8 KB). Organização com falha → `suggestion=null`, transcrição mantida.

**Fluxo servidor (`transcribeNote` reescrito):**
1. RPC `inspection_note_transcription_claim(note_id)` (abaixo) — reserva com prazo de 10 min; se outra reserva ativa ou já concluída, devolve a nota sem chamar o provedor.
2. Baixa áudio, transcreve, organiza.
3. RPC `inspection_note_transcription_finish(note_id, token, transcript, suggestion, erro)` grava conclusão ou falha (mensagem curta em português, sem detalhe técnico), só se o token ainda for o da reserva e a nota ainda existir.
4. Retorna a nota; erro do provedor vira estado `falhou`, não exceção crua.

**Disparo automático (cliente, `use-inspection.ts`):** novo laço `useTranscriptionRunner` separado da fila de envio (não bloqueia fotos): após envio de nota de voz, ao abrir a vistoria e no evento `online`, pega notas `voz` com `transcription_state in ('pendente','falhou')`, `transcription_attempts < 5`, sem reserva ativa; uma por vez, espera crescente (`backoffDelay`). Assim as notas de 25/11 são processadas ao abrir a a2a5a174, uma vez cada (a reserva impede duplicação entre abas).

**Reprocessamento pelo servidor (opcional, precisa do seu OK separado):** rota `/api/public/hooks/vistoria-transcribe` autenticada por `internal_worker_headers()`, lote de até 5 notas pendentes de vistorias não finalizadas, mesma reserva; agendamento novo pg_cron **a cada hora (24 execuções/dia)**. Não incluo agora; o disparo ao abrir a tela já cobre os critérios.

**Tela (`notes-editor.tsx`):**
- transcrevendo: "Transcrevendo…" com indicador
- falhou: "Não foi possível transcrever: <motivo>" + botão "Tentar de novo"
- pendente: "Aguardando transcrição"
- desligado (corretor): "Transcrição indisponível no momento. O áudio está salvo."
- desligado (admin): acrescenta "A transcrição está desligada no servidor."
- Aviso flutuante só em "Tentar de novo", "Excluir áudio" e "Regravar". Removo os textos técnicos (nomes de variável) da tela, inclusive o aviso em `inspection-workspace.tsx:1463`.

## Tema 2 — Excluir e regravar
**Excluir áudio:** menu do sistema em cada nota de voz (botões ≥ 44 px, `aria-label`, desativados em somente leitura). Confirmação: "Excluir este áudio? Esta ação não pode ser desfeita." Server fn `deleteVoiceNote(noteId)`: checa `inspection_can_edit`, recusa caminho com `/docs/`, apaga a linha (policy de DELETE existente; a reserva some junto), depois remove o arquivo do bucket; falha ao remover arquivo → evento `note_audio_orphan` em `inspection_events`, tela segue normal. Evento `note_deleted` registrado. No aparelho: remove da fila local itens com a mesma `clientKey` e cancela o laço de transcrição dessa nota. `unreviewed_notes` cai automaticamente (contagem é por linha).

**Regravar:** abre o gravador no mesmo cômodo/item com `replacesNoteId`. O item da fila guarda esse campo; só depois de arquivo enviado **e** nota nova criada, chama `deleteVoiceNote(anterior)`. Falha ou cancelamento → anterior intacto. Nota nova segue transcrição automática.

**Player:** mantém "Ouvir áudio original", `controlsList="nodownload noplaybackrate"`.

## Migração 0116 (próximo número livre; 0115 fica reservada)
Justificativa: registrar estado, erro, tentativas e reserva com prazo; sem preenchimento em massa (colunas com padrão; só notas `voz` pendentes entram no processamento). `status` atual e CHECK não mudam.

```sql
ALTER TABLE public.inspection_notes
  ADD COLUMN transcription_state text NOT NULL DEFAULT 'pendente'
    CHECK (transcription_state IN ('pendente','transcrevendo','falhou','concluida')),
  ADD COLUMN transcription_error text CHECK (transcription_error IS NULL OR length(transcription_error) <= 200),
  ADD COLUMN transcription_attempts integer NOT NULL DEFAULT 0 CHECK (transcription_attempts >= 0),
  ADD COLUMN transcription_lease_token uuid,
  ADD COLUMN transcription_lease_until timestamptz;

CREATE INDEX inspection_notes_transcription_idx
  ON public.inspection_notes (inspection_id)
  WHERE source = 'voz' AND transcription_state IN ('pendente','falhou','transcrevendo');

CREATE OR REPLACE FUNCTION public.inspection_note_transcription_claim(p_note uuid)
RETURNS TABLE(claimed boolean, lease_token uuid, note jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.inspection_notes; t uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM public.inspection_notes WHERE id = p_note FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relato não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.inspection_can_edit(r.inspection_id) THEN
    RAISE EXCEPTION 'Vistoria concluída ou sem acesso para edição.' USING ERRCODE = '42501'; END IF;
  IF r.source <> 'voz' OR r.audio_path IS NULL OR r.transcription_state = 'concluida'
     OR r.transcript_original IS NOT NULL
     OR (r.transcription_lease_until IS NOT NULL AND r.transcription_lease_until > now()) THEN
    RETURN QUERY SELECT false, NULL::uuid, to_jsonb(r); RETURN;
  END IF;
  UPDATE public.inspection_notes
     SET transcription_state = 'transcrevendo', transcription_error = NULL,
         transcription_attempts = transcription_attempts + 1,
         transcription_lease_token = t, transcription_lease_until = now() + interval '10 minutes'
   WHERE id = p_note RETURNING * INTO r;
  RETURN QUERY SELECT true, t, to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.inspection_note_transcription_finish(
  p_note uuid, p_token uuid, p_transcript text, p_suggestion jsonb, p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.inspection_notes;
BEGIN
  SELECT * INTO r FROM public.inspection_notes WHERE id = p_note FOR UPDATE;
  IF NOT FOUND OR r.transcription_lease_token IS DISTINCT FROM p_token THEN RETURN NULL; END IF;
  IF NOT public.inspection_can_edit(r.inspection_id) THEN
    RAISE EXCEPTION 'Vistoria concluída ou sem acesso para edição.' USING ERRCODE = '42501'; END IF;
  IF p_error IS NULL AND coalesce(btrim(p_transcript), '') <> '' THEN
    UPDATE public.inspection_notes SET transcript_original = p_transcript, suggestion = p_suggestion,
      status = CASE WHEN status = 'pendente_transcricao' THEN 'transcrito' ELSE status END,
      transcription_state = 'concluida', transcription_error = NULL,
      transcription_lease_token = NULL, transcription_lease_until = NULL
    WHERE id = p_note RETURNING * INTO r;
  ELSE
    UPDATE public.inspection_notes SET transcription_state = 'falhou',
      transcription_error = left(coalesce(p_error, 'Não foi possível entender o áudio.'), 200),
      transcription_lease_token = NULL, transcription_lease_until = NULL
    WHERE id = p_note RETURNING * INTO r;
  END IF;
  RETURN to_jsonb(r);
END $$;

REVOKE ALL ON FUNCTION public.inspection_note_transcription_claim(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspection_note_transcription_finish(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_note_transcription_claim(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inspection_note_transcription_finish(uuid, uuid, text, jsonb, text) TO authenticated, service_role;
```
- `SECURITY INVOKER`: RLS e policies de UPDATE (`inspection_can_edit`) continuam valendo; nenhuma policy/grant de tabela muda; bloqueios `meta_reviewer`/`atendimentos_viewer` seguem valendo.
- Avanço de `revision`: o gatilho existente de revisão (0035) dispara em cada UPDATE; o `finish` usa o token como controle otimista da transcrição, e edições do texto aprovado continuam com `.eq("revision")`. Confirmar na implementação que o gatilho de revisão raiz não bloqueia esses UPDATEs.

## Arquivos
Criar: `src/lib/vistoria/audio-format.ts`, `wav-split.ts`, `transcription-runner.ts` (lógica pura de seleção/espera), testes correspondentes, `tests/vistoria-ui/notes-voice.vitest.tsx`, `tests/sql/0116_transcription.test` (PGlite).
Alterar: `voice.server.ts`, `voice.functions.ts` (+ `deleteVoiceNote`), `use-inspection.ts`, `media-client.ts` (só extensão), `local-store.ts` (remover por clientKey, campo `replacesNoteId`), `notes-editor.tsx`, `inspection-workspace.tsx`, `types.ts`, `docs/vistoria-inteligente.md`, `src/lib/vistoria/AGENTS.md`, `AGENTS.md` (substituir regra de voz).

## Testes
`voiceStatus` sem variável / com `"false"`; WAV, WebM, MP4, OGG com nome e extensão; divisão de WAV > 25 MB (cabeçalhos e ordem); não-WAV grande recusado; erro 402/429/500 → `falhou` com mensagem em português; organização falha → transcrição mantida; duas reivindicações simultâneas → uma chamada ao gateway (simulado); token antigo não grava; runner: pendente/falhou, limite 5, espera crescente, não bloqueia fila de fotos; estados da tela; exclusão (permissão, vistoria finalizada bloqueada, `docs/` recusado, arquivo removido, fila local limpa, contagem atualizada); regravação (anterior só sai depois da nova, falha mantém anterior); migração em PGlite. Depois: tsc, build de produção, suíte completa (todas as configs vitest, `node --test`, banco isolado) com números, incluindo fotos (15), PR #51, competência e vistoria.

## Validação após publicar (você)
Abrir a2a5a174 → as duas notas viram "Transcrevendo…" e depois texto, uma vez cada; gravar nota nova no Android e no iPhone; excluir e regravar.

## Riscos
- Custo de IA: ~1 transcrição por nota + 1 organização; teto de 5 tentativas.
- Provedor rejeitar WebM/M4A de algum aparelho → fica `falhou` com mensagem, áudio preservado.
- Memória do servidor ao dividir WAV de 57 MB: processo por segmento, limite de 60 MB.

## Rollback
Código: reverter o commit. Banco: `DROP FUNCTION` das duas funções, `DROP INDEX`, e colunas marcadas `DEPRECATED` (sem apagar). Desligar a voz sem publicar: `VISTORIA_VOZ_ATIVA=false`.

Nada é publicado até seu OK.
