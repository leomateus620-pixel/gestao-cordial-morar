# Vistoria: transcrição dos relatos de voz + excluir/regravar áudio

## Causa raiz (confirmada só por leitura)
1. `voice.server.ts` `voiceStatus()` exige `LOVABLE_API_KEY` **e** `VISTORIA_VOZ_ATIVA === "true"`. No servidor: `LOVABLE_API_KEY` existe (gerenciada); `VISTORIA_VOZ_ATIVA` **não existe**. Logo `transcribe.ready=false`.
2. `inspection-workspace.tsx:107` calcula `voiceReady=false` e passa para `useLocalQueue` → `use-inspection.ts:211` nunca chama `transcribeNote`; `notes-editor.tsx:262` desativa o botão ("Transcrição ainda indisponível").
3. Quando chamado, `use-inspection.ts:213` descarta erro com `.catch(() => undefined)`; não há estado de falha no banco (CHECK só aceita `pendente_transcricao/transcrito/revisado/descartado`).
4. `voice.functions.ts:40` usa nome do caminho ou `relato.wav`, e tipo `audio/wav` por reserva, sem olhar o tipo real.
5. Notas 4925cc2c (5,0 s) e e0c31bfc (3,7 s): `voz`, `audio/wav`, `pendente_transcricao`, revisão 1.
6. Gateway: `openai/gpt-transcribe` e `openai/gpt-6-astra` existem no catálogo (sem chamada paga).
7. Revisões (0033/0035): `inspection_notes_touch` soma +1 em `inspection_notes.revision` a cada UPDATE, e `inspection_notes_aggregate` faz UPDATE em `inspections`, que soma +1 na revisão raiz (usada em reordenar fotos e concluir). Uma reserva em segundo plano, sem cuidado, causaria conflito falso (ver "Revisões").

## Limites reais do servidor
As funções do servidor rodam no ambiente de borda do Lovable: **128 MB de memória por chamada**, ~30 s de processamento de CPU (espera de rede não conta), até 6 conexões de saída simultâneas, sem limite de tempo de parede enquanto o aparelho mantém a conexão aberta. Por isso:
- O WAV **nunca** é carregado inteiro: o servidor lê o cabeçalho (primeiros 64 KB) e cada segmento por **leitura por intervalo** (URL assinada + cabeçalho `Range`) e envia um segmento por vez. Pico de memória ≈ 2 × 24 MB.
- Tempo limite por chamada: 5 min por segmento, 2 min para organização. Se a conexão cair no meio, a reserva vence e o laço retoma (ver item "Notas presas").
- Limite aceito: WAV até 60 MB (~30 min); outros formatos até 24 MB.

## Tema 1 — Transcrição
**Ativação:** `ready = hasKey && process.env.VISTORIA_VOZ_ATIVA !== "false"`. GPT-Live continua desligado. `getVoiceStatus` filtra no servidor: só administrador (`has_role` via sessão do usuário) recebe a lista `missing`; os demais recebem `missing: []`.

**Formatos:** novo `audio-format.ts` (puro): mapa mime→extensão (`audio/wav|x-wav→.wav`, `audio/webm(;codecs=opus)→.webm`, `audio/mp4|x-m4a|aac→.m4a`, `audio/ogg→.ogg`); mime vem da nota, depois do blob, depois da extensão do caminho; nome enviado `relato.<ext>`. Em `media-client.ts`/`use-inspection.ts` a extensão do caminho de envio passa a seguir o mime real.

**WAV longo (`wav-split.ts`, puro):** percorre os blocos RIFF a partir do byte 12 até achar `fmt ` e `data`, pulando blocos extras (`LIST`, `fact`, etc., com alinhamento par). Se o tamanho de `data` for 0, `0xFFFFFFFF` ou maior que o restante do arquivo (gravação interrompida), usa os bytes restantes do arquivo, arredondados para baixo ao `blockAlign`. Gera intervalos ≤ 24 MB alinhados a `blockAlign`; cada segmento recebe cabeçalho novo de 44 bytes. Transcrição em ordem, texto concatenado com espaço. Não-WAV > 24 MB: "Áudio muito longo para transcrever. Grave em partes menores."

**Chamadas:** leitura de resposta limitada (SSE até 1 MB; corpo de erro até 8 KB). Organização com falha → `suggestion=null`, transcrição mantida.

**Fluxo servidor (`transcribeNote` reescrito):**
1. `inspection_note_transcription_claim(note)` — reserva com prazo calculado pelo tamanho: `10 min × nº de segmentos` (mín. 10 min); devolve token. Se reserva ativa, concluída, ou `next_at` no futuro, devolve a nota sem chamar o provedor.
2. Antes de cada segmento: `inspection_note_transcription_renew(note, token)` estende o prazo +10 min e confere o token; token perdido → para sem gravar.
3. `inspection_note_transcription_finish(note, token, transcript, suggestion, erro, retryable)` só grava se o token ainda for o da reserva e a nota existir.
4. Erros: 402/429/5xx/rede → `retryable=true` (não soma tentativa; `next_at` com espera crescente; mensagem em português, ex. "Créditos de IA esgotados no workspace. Tentaremos de novo mais tarde."). 400/áudio inválido/vazio → `retryable=false` (soma tentativa). Limite de 5 tentativas não-retentáveis; 402/429 nunca esgotam as tentativas.

**Disparo automático (`useTranscriptionRunner` em `use-inspection.ts`, separado da fila de envio, não bloqueia fotos):**
- Só roda quando `voiceReady=true`; desligado → não roda e não conta tentativa.
- Considera apenas `source='voz'` com `audio_path` e estado efetivo pendente, falhou (com `next_at` vencido e tentativas < 5), ou **transcrevendo com reserva vencida** (nota presa).
- Gatilhos: após envio de nota de voz, ao abrir a vistoria e no evento `online`; uma nota por vez, espera crescente local (`backoffDelay`). Duas abas → a reserva garante uma transcrição só.
- As notas de 25/11 são transcritas ao abrir a2a5a174, uma vez cada.

**Notas de texto (escolha):** `transcription_state` fica **sem padrão (NULL)**; um gatilho BEFORE INSERT põe `'pendente'` só quando `source='voz'`. Notas de texto ficam NULL e nunca parecem pendentes. Notas de voz antigas (as duas de 25/11) também ficam NULL e não são preenchidas em massa; o código trata `voz` + NULL + `status='pendente_transcricao'` + sem transcrição como pendente. Escolhi isso para não marcar milhares de notas de texto com um estado que não existe para elas.

**Reprocessamento pelo servidor:** fora deste plano (sem agendamento novo).

**Tela (`notes-editor.tsx`):**
- pendente: "Aguardando transcrição"
- transcrevendo (reserva válida): "Transcrevendo…" com indicador
- transcrevendo com reserva vencida: "A transcrição foi interrompida." + "Tentar de novo"
- falhou: "Não foi possível transcrever: <motivo>" + "Tentar de novo"
- espera por créditos/limite: motivo em português + "Tentar de novo"
- desligado (corretor): "Transcrição indisponível no momento. O áudio está salvo."
- desligado (admin): acrescenta "A transcrição está desligada no servidor."
- Aviso flutuante só em "Tentar de novo", "Excluir áudio" e "Regravar". Removo os textos técnicos da tela, inclusive o aviso em `inspection-workspace.tsx:1463`.

## Revisões (sem conflito falso)
- **Revisão da nota:** troco o gatilho `inspection_notes_touch` por `inspection_notes_touch_v2`, que soma revisão só quando muda conteúdo editado pelo vistoriador (`approved_text`, `status`, `item_id`, `room_id`, `audio_path`). Reserva, renovação, falha e conclusão (`transcription_*`, `transcript_original`, `suggestion`) não mudam `revision`; o salvamento do texto aprovado (`.eq("revision")`) não conflita. A conclusão só muda `status` de `pendente_transcricao` para `transcrito`; para não bumpar por isso, essa transição específica também é ignorada.
- **Revisão raiz:** o gatilho agregado de notas passa a rodar em UPDATE só quando muda conteúdo que entra no laudo (`approved_text`, `status`, `item_id`, `room_id`, `audio_path`, `transcript_original`, `suggestion`). Reserva/renovação/falha não tocam a vistoria, então reordenar fotos e editar outro item não conflitam. A conclusão da transcrição muda a revisão raiz (conteúdo novo para o laudo); efeito: um reordenar enviado exatamente nesse instante pede "atualize" uma vez — aceitável e correto.
- INSERT e DELETE continuam passando pelo agregado (inclui o bloqueio de vistoria não editável).

## Tema 2 — Excluir e regravar
**Excluir áudio:** menu do sistema em cada nota de voz (botões ≥ 44 px, `aria-label`, desativados em somente leitura). Confirmação: "Excluir este áudio? Esta ação não pode ser desfeita." Se a nota tiver texto aprovado ou estiver revisada: "Excluir este áudio? O texto aprovado deste relato também será removido. Esta ação não pode ser desfeita." Server fn `deleteVoiceNote(noteId)`: checa `inspection_can_edit`, recusa caminho com `/docs/`, apaga a linha (policy de DELETE existente; a reserva some junto, e um `finish` posterior não acha a nota e não grava), depois remove o arquivo; falha ao remover arquivo → evento `note_audio_orphan` em `inspection_events`, tela segue normal. Evento `note_deleted`. No aparelho: remove da fila local itens com a mesma `clientKey` e cancela o laço dessa nota. `unreviewed_notes` cai automaticamente.

**Regravar:** se a nota antiga tiver texto aprovado/revisada, **antes de abrir o gravador**: "Regravar substitui este áudio e remove o texto aprovado deste relato depois que o novo for salvo. Continuar?" Abre o gravador no mesmo cômodo/item com `replacesNoteId`. O item da fila guarda esse campo; só depois de arquivo enviado **e** nota nova criada chama `deleteVoiceNote(anterior)`. Falha ou cancelamento → anterior intacto. Nota nova segue transcrição automática.

**Player:** mantém "Ouvir áudio original", `controlsList="nodownload noplaybackrate"`.

## Migração 0116 (próximo número livre; 0115 fica reservada)
Justificativa: registrar estado, erro, tentativas, espera e reserva com prazo; evitar conflito falso de revisão. Sem preenchimento em massa; `status` e seu CHECK não mudam; RLS, policies e grants da tabela não mudam.

```sql
ALTER TABLE public.inspection_notes
  ADD COLUMN transcription_state text
    CHECK (transcription_state IS NULL OR transcription_state IN ('pendente','transcrevendo','falhou','concluida')),
  ADD COLUMN transcription_error text CHECK (transcription_error IS NULL OR length(transcription_error) <= 200),
  ADD COLUMN transcription_attempts integer NOT NULL DEFAULT 0 CHECK (transcription_attempts >= 0),
  ADD COLUMN transcription_next_at timestamptz,
  ADD COLUMN transcription_lease_token uuid,
  ADD COLUMN transcription_lease_until timestamptz;

CREATE INDEX inspection_notes_transcription_idx
  ON public.inspection_notes (inspection_id)
  WHERE source = 'voz' AND transcript_original IS NULL;

-- Notas de voz novas nascem 'pendente'; notas de texto ficam NULL.
CREATE OR REPLACE FUNCTION public.inspection_notes_transcription_default()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.source = 'voz' AND NEW.transcription_state IS NULL THEN NEW.transcription_state := 'pendente'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inspection_notes_transcription_default
  BEFORE INSERT ON public.inspection_notes FOR EACH ROW
  EXECUTE FUNCTION public.inspection_notes_transcription_default();

-- Revisão da nota: só conteúdo do vistoriador.
CREATE OR REPLACE FUNCTION public.inspection_notes_touch_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF ROW(NEW.approved_text, NEW.item_id, NEW.room_id, NEW.audio_path)
       IS DISTINCT FROM ROW(OLD.approved_text, OLD.item_id, OLD.room_id, OLD.audio_path)
     OR (NEW.status IS DISTINCT FROM OLD.status
         AND NOT (OLD.status = 'pendente_transcricao' AND NEW.status = 'transcrito')) THEN
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER inspection_notes_touch ON public.inspection_notes;
CREATE TRIGGER inspection_notes_touch BEFORE UPDATE ON public.inspection_notes
  FOR EACH ROW EXECUTE FUNCTION public.inspection_notes_touch_v2();

-- Revisão raiz: UPDATE só quando muda conteúdo do laudo.
DROP TRIGGER inspection_notes_aggregate ON public.inspection_notes;
CREATE TRIGGER inspection_notes_aggregate BEFORE INSERT OR DELETE ON public.inspection_notes
  FOR EACH ROW EXECUTE FUNCTION public.inspection_touch_aggregate();
CREATE TRIGGER inspection_notes_aggregate_upd BEFORE UPDATE ON public.inspection_notes
  FOR EACH ROW WHEN (
    ROW(NEW.approved_text, NEW.status, NEW.item_id, NEW.room_id, NEW.audio_path, NEW.transcript_original, NEW.suggestion)
    IS DISTINCT FROM
    ROW(OLD.approved_text, OLD.status, OLD.item_id, OLD.room_id, OLD.audio_path, OLD.transcript_original, OLD.suggestion))
  EXECUTE FUNCTION public.inspection_touch_aggregate();

CREATE OR REPLACE FUNCTION public.inspection_note_transcription_claim(p_note uuid, p_segments integer DEFAULT 1)
RETURNS TABLE(claimed boolean, lease_token uuid, note jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.inspection_notes; t uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM public.inspection_notes WHERE id = p_note FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relato não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.inspection_can_edit(r.inspection_id) THEN
    RAISE EXCEPTION 'Vistoria concluída ou sem acesso para edição.' USING ERRCODE = '42501'; END IF;
  IF r.source <> 'voz' OR r.audio_path IS NULL OR r.transcript_original IS NOT NULL
     OR r.transcription_state = 'concluida'
     OR r.transcription_attempts >= 5
     OR (r.transcription_lease_until IS NOT NULL AND r.transcription_lease_until > now())
     OR (r.transcription_next_at IS NOT NULL AND r.transcription_next_at > now()) THEN
    RETURN QUERY SELECT false, NULL::uuid, to_jsonb(r); RETURN;
  END IF;
  UPDATE public.inspection_notes
     SET transcription_state = 'transcrevendo', transcription_error = NULL,
         transcription_lease_token = t,
         transcription_lease_until = now() + make_interval(mins => 10 * greatest(1, least(coalesce(p_segments,1), 6)))
   WHERE id = p_note RETURNING * INTO r;
  RETURN QUERY SELECT true, t, to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.inspection_note_transcription_renew(p_note uuid, p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.inspection_notes SET transcription_lease_until = now() + interval '10 minutes'
   WHERE id = p_note AND transcription_lease_token = p_token AND public.inspection_can_edit(inspection_id);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.inspection_note_transcription_finish(
  p_note uuid, p_token uuid, p_transcript text, p_suggestion jsonb, p_error text, p_retryable boolean DEFAULT false)
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
      transcription_state = 'concluida', transcription_error = NULL, transcription_next_at = NULL,
      transcription_lease_token = NULL, transcription_lease_until = NULL
    WHERE id = p_note RETURNING * INTO r;
  ELSE
    UPDATE public.inspection_notes SET transcription_state = 'falhou',
      transcription_error = left(coalesce(p_error, 'Não foi possível entender o áudio.'), 200),
      transcription_attempts = transcription_attempts + CASE WHEN p_retryable THEN 0 ELSE 1 END,
      transcription_next_at = now() + make_interval(secs => least(3600, 30 * power(2, least(transcription_attempts, 7))::int)),
      transcription_lease_token = NULL, transcription_lease_until = NULL
    WHERE id = p_note RETURNING * INTO r;
  END IF;
  RETURN to_jsonb(r);
END $$;

REVOKE ALL ON FUNCTION public.inspection_note_transcription_claim(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspection_note_transcription_renew(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspection_note_transcription_finish(uuid, uuid, text, jsonb, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspection_notes_touch_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inspection_notes_transcription_default() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inspection_note_transcription_claim(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inspection_note_transcription_renew(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inspection_note_transcription_finish(uuid, uuid, text, jsonb, text, boolean) TO authenticated, service_role;
```
- `SECURITY INVOKER`: RLS e policy de UPDATE (`inspection_can_edit`) continuam valendo; bloqueios `meta_reviewer`/`atendimentos_viewer` seguem; a função `inspection_touch` original continua existindo para os outros gatilhos (cômodos, itens, fotos).
- Na implementação, antes de aplicar, leio a definição atual de `inspection_touch` no banco e garanto que `inspection_notes_touch_v2` mantém qualquer outra regra dela (ex. bloqueio de vistoria concluída) além da revisão.

## Arquivos
Criar: `src/lib/vistoria/audio-format.ts`, `wav-split.ts`, `transcription-runner.ts` (seleção, nota presa, espera), testes correspondentes, `tests/vistoria-ui/notes-voice.vitest.tsx`, teste PGlite da 0116.
Alterar: `voice.server.ts`, `voice.functions.ts` (+ `deleteVoiceNote`, filtro admin em `getVoiceStatus`), `use-inspection.ts`, `media-client.ts` (só extensão), `local-store.ts` (remover por clientKey, `replacesNoteId`), `notes-editor.tsx`, `inspection-workspace.tsx`, `types.ts`, `docs/vistoria-inteligente.md`, `src/lib/vistoria/AGENTS.md`, `AGENTS.md` (substituir regra de voz).

## Testes
`voiceStatus` sem variável / com `"false"`; `getVoiceStatus` sem `missing` para não-admin; WAV, WebM, MP4, OGG com nome e extensão; divisão de WAV > 25 MB (cabeçalhos, ordem, leitura por intervalo); WAV com `data` zerado/inválido; WAV com bloco `LIST` antes de `data`; não-WAV grande recusado; 402/429 → falha retentável sem somar tentativa e com espera; 400 → soma tentativa; organização falha → transcrição mantida; duas reivindicações simultâneas → uma chamada ao gateway (simulado); renovação por segmento e token perdido não grava; nota presa (reserva vencida) é retomada; runner não roda com serviço desligado; nota de texto nunca entra no laço; não bloqueia fila de fotos; estados da tela; revisões: reserva/falha não mudam `revision` da nota nem da vistoria; conclusão não muda `revision` da nota; editar texto aprovado durante transcrição não conflita; exclusão (permissão, vistoria finalizada bloqueada, `docs/` recusado, arquivo removido, fila local limpa, contagem atualizada, aviso de texto aprovado); regravação (aviso antes de gravar, anterior só sai depois da nova, falha mantém anterior); migração em PGlite. Depois: tsc, build de produção, suíte completa (todas as configs vitest, `node --test`, banco isolado) com números, incluindo fotos (15), PR #51, competência e vistoria.

## Validação após publicar (você)
Abrir a2a5a174 → as duas notas viram "Transcrevendo…" e depois texto, uma vez cada; gravar nota nova no Android e no iPhone; excluir e regravar.

## Riscos
- Custo de IA: ~1 transcrição por nota + 1 organização; teto de 5 tentativas não-retentáveis; 402/429 com espera crescente até 1 h.
- Provedor rejeitar WebM/M4A de algum aparelho → `falhou` com mensagem, áudio preservado.
- Aparelho fecha a tela no meio de áudio longo → reserva vence e a próxima abertura retoma.
- Troca dos gatilhos de nota: coberta por testes de revisão em PGlite.

## Rollback
Código: reverter o commit. Banco: recriar `inspection_notes_touch` com `inspection_touch()` e `inspection_notes_aggregate` em INSERT/UPDATE/DELETE (como na 0033/0035), remover `inspection_notes_aggregate_upd`, o gatilho de padrão e as funções novas; colunas marcadas `DEPRECATED` (sem apagar). Desligar a voz sem publicar: `VISTORIA_VOZ_ATIVA=false`.

Nada é publicado até seu OK.
