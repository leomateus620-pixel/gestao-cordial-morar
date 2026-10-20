# Vistoria inteligente

Módulo de vistorias (entrada, saída, periódica, constatação) com checklist por ambiente, fotos, relatos por voz/texto, revisão e laudo em PDF versionado. Prioridade: celular.

## Fontes de pesquisa

- IBRESP — _Como realizar uma boa vistoria imobiliária_ (checklist por cômodo, materiais/cores, testes elétricos/hidráulicos, comparação entrada/saída).
- Superlógica — vistoria pelo sistema de gestão (identificação, entrada/saída, vistoriador, medidores, mobiliado/limpeza, PDF com fotos).
- Kenlo Vistorias — avaliação por ambiente/item, fotos amplas + pontuais, material/cor, medidores e fornecimento, revisão posterior.
- Documentação Lovable AI — GPT Transcribe (áudio→texto) e GPT-Live 1 (conversa bidirecional); gravações longas em segmentos.

## Acesso

- Menu "Vistoria inteligente" (seção Operação; no celular, em "Mais") para administrador, secretaria e corretor (`AppModule "vistorias"`).
- Corretor: só vistorias que criou ou das quais é responsável; não atribui a outra pessoa. Admin/secretaria: todas, e podem escolher o responsável.
- Espelhado no banco: RLS em todas as tabelas (`inspection_can_access`, `inspection_can_edit`) e no bucket privado `inspection-media`. Nenhuma chave de serviço no navegador; URLs de arquivos são temporárias (assinadas).

## Modelo de dados (Drizzle 0033/0034/0035)

`inspections` → `inspection_rooms` → `inspection_items`; `inspection_media`, `inspection_notes`, `inspection_documents`, `inspection_events`.

- FKs compostas: item/foto/relato só podem apontar para cômodo da **mesma** vistoria; foto/relato de item só para item do **mesmo** cômodo.
- Caminho de arquivo obrigatório `<vistoria>/<cômodo>/<chave>` (CHECK no banco + validação no servidor); IDs, cômodo e caminho são imutáveis (gatilho).
- Idempotência: vistoria com id gerado no aparelho; foto/relato com `client_key` único por vistoria.
- Controle otimista: cada linha tem `revision`; gravação com revisão antiga devolve conflito ("mudou em outra tela") em vez de sobrescrever.
- Snapshot da identificação do imóvel na criação (`property_snapshot.cadastro` + `confirmado`). O cadastro do imóvel **nunca** é alterado.

## Fluxo de campo

1. **Central:** próxima vistoria a continuar antes dos controles; busca específica, filtros em painel, status compactos, paginação de 20. Imobiliária, responsável, busca, tipo e período são aplicados na RPC `inspection_list`, sob RLS. As contagens representam esse escopo **antes do filtro de status**. O período é explicitamente `inspected_at` (data da vistoria) ou `created_at` (criação); o dia final inclui o dia inteiro em America/Sao_Paulo. Nenhuma foto é baixada para montar a central.
2. **Criação:** Imóvel → Preparação → Ambientes → Iniciar. Seleção pelo ID com tipo/endereço/complemento/carteira e códigos nomeados Cordial/Morar; código externo isolado não identifica um cadastro. Respostas antigas da busca são ignoradas. Participantes, medidores, chaves, mobiliado e limpeza ficam em detalhes opcionais. O UUID nasce no rascunho; `inspection_create` cria vistoria, ambientes e itens numa transação e reutiliza o mesmo ID na retomada.
3. **Ambientes do imóvel:** convenção do cadastro — dormitórios inclui suítes e banheiros inclui os das suítes. Terreno gera Terreno; tipo desconhecido não gera uma lista presumida. Adicionar/remover/renomear/reordenar ambientes invalida a confirmação no banco; é necessário conferir novamente a lista.
4. **Execução:** cabeçalho contextual e um rodapé operacional. Lista completa em Ver ambientes; áreas Itens/Fotos/Relatos com acesso direto. Avaliações em cards expansíveis; Regular também permite avaria. Ruim exige descrição e Não testado exige motivo. Foto/relato de item preservam o vínculo confirmado. O último ambiente abre Revisão. Pendências permitem continuar a coleta.
5. **Fotos:** proporção preservada, ampliação, legenda/vínculo recuperáveis, navegação e renovação de acesso em caso de URL com falha. O redimensionamento existente para 2048 px/JPEG permanece; EXIF/GPS não são enviados. Data é a captura/importação no app. Ordenação usa uma única RPC com lista completa e revisão agregada; inserções recebem posição no banco.
6. **Relatos:** editor junto à ação, identificado por ambiente/item. Original, transcrição, sugestão e texto aprovado permanecem separados. A gravação PCM/WAV segmentada captura contexto estável de usuário/vistoria/ambiente/item; refetch/rerender não encerra a sessão, troca de contexto encerra e salva na origem. Indisponibilidade de transcrição é apresentada sem instruções de servidor na tela do corretor.
7. **Revisão:** grupos de dados gerais, avaliações, avarias/evidências, relatos e envios com destino de correção. Preenchidos, avaliados, N/A e não testados são contados separadamente. Alertas de aplicabilidade e incoerência usam vínculos estruturados; não há interpretação universal de palavras, mudança automática de estado ou percentual bloqueante de N/A. O corretor confirma a revisão; bloqueios técnicos continuam obrigatórios.
8. **Laudo:** conteúdo completo por ambiente, referências estáveis de item/foto, fotos próximas dos registros, cabeçalhos de continuação e assinaturas com quebra de nome. Prévia e situação da vistoria têm rótulos separados. Em concluídas, a ação principal baixa o documento oficial existente.

## Persistência, conflitos e contas

- `DraftController` vive acima dos editores; escopo é usuário + vistoria + ambiente + entidade/item + conjunto de campos. Descrição de avaria, material/cor/quantidade, observações, relato ainda não enviado, texto aprovado, dados gerais e criação são escritos a cada alteração, sem depender de blur.
- IndexedDB confirma somente em `transaction.oncomplete`; abort, quota e indisponibilidade não podem resultar em “Salvo”. Os estados distinguem gravação no aparelho, No aparelho, Enviando e falha/conflito; Salvo corresponde à confirmação do servidor.
- Escritas locais são serializadas, seguidas por debounce de 700 ms e envios serializados. Uma resposta reconhece somente a geração enviada. Edição durante a requisição permanece local e é enviada depois. Refetch/IA não substituem o overlay local.
- Antes de enviar, buscamos a linha atual e comparamos somente os campos editados com sua base. Mudanças incompatíveis preservam o rascunho para escolha na Revisão. Duas abas têm identificadores de escrita distintos: uma gravação deslocada é arquivada na mesma transação, e o reconhecimento de uma geração não apaga a geração da outra aba. Versões recuperadas exigem decisão, inclusive na criação.
- Trocar cômodo/aba mantém os rascunhos na origem. Navegação espera o commit local; falha de armazenamento impede sair silenciosamente. `beforeunload` protege escritas ainda não duráveis e mídia ainda só em memória; fechar à força o navegador não garante recuperação de dados cujo armazenamento falhou.
- Cache de consulta, snapshot offline, fila e rascunhos incluem usuário e vistoria. Falha de autorização não permite usar o cache como fallback. Offline exige uma visita anterior à vistoria e dados locais disponíveis; não equivale a um service worker capaz de iniciar o app sem cache de aplicação.
- Remover ambiente exige confirmação dos registros afetados, pausa envios daquele contexto, espera requisições em andamento e só então descarta a fila/rascunhos após exclusão confirmada. Falha na exclusão retoma os envios. Outros ambientes permanecem intactos.
- Relatos digitados aguardam “Salvar relato” e revisão explícita. Texto ainda local bloqueia a emissão, assim como fotos/áudios pendentes, cache offline ou falha da fila.

## Emissão canônica e migração 0035

A migração está no journal Drizzle. **Não foi aplicada ao banco de produção nesta revisão.** Servidor, cliente e migração devem ser disponibilizados juntos pelo fluxo existente.

Para conferir e aplicar o upgrade pelo mesmo journal, consulte o [procedimento de aplicação da 0035](vistoria-migracao-0035.md). O comando `db:vistoria:check` é somente leitura; `db:vistoria:apply` exige confirmação explícita. O workflow manual não é acionado pelo CI nem pelo merge.

1. Triggers de INSERT/UPDATE/DELETE em ambientes/itens/fotos/relatos bloqueiam a raiz e avançam sua revisão. A revisão vista na tela abrange todos os filhos.
2. O cliente envia apenas ID, revisão revisada e confirmação do corretor. `finalizeInspection` obtém `inspection_snapshot` no servidor, gera o PDF com imagens privadas e calcula SHA-256; nenhum snapshot/PDF declarado pelo cliente é aceito para emissão.
3. Renderização usa timestamp do snapshot e metadados determinísticos, permitindo retomar a mesma emissão. Upload é exclusivo do servidor, sem upsert, em `docs/v<n>-<sha16>.pdf`; um caminho já existente tem seus bytes conferidos por SHA-256.
4. `inspection_finalize_server`, executável apenas por service_role, revalida o ator real e chama `inspection_finalize`. A RPC compara revisão agregada e snapshot canônico sob bloqueio, reaplica todos os gates e registra snapshot/documento/status numa transação. Qualquer alteração concorrente exige atualizar e revisar novamente.
5. Falha entre upload e RPC pode deixar arquivo sem versão registrada; a tentativa seguinte retoma o mesmo caminho se os dados não mudaram. Não há sobrescrita nem limpeza automática de laudos. Retries de versão já confirmada retornam a versão existente. Reabertura exige motivo e mantém o documento anterior imutável.

O bucket permanece privado; FKs compostas, RLS, caminhos imutáveis e RPC de reabertura foram preservados. Navegadores não podem inserir arquivos em `/docs/` nem executar diretamente a RPC de emissão. O servidor requer a configuração `SUPABASE_SERVICE_ROLE_KEY` já usada pelo cliente administrativo existente; nunca enviá-la ao navegador.

## PDF e política de caracteres

Helvetica/Helvetica Bold padrão cobrem os acentos do português. Caracteres fora de WinAnsi são representados por código Unicode visível (`[U+1F642]`, por exemplo), com explicação no documento; não viram “?” silenciosamente. Esse fallback preserva a identificação do caractere, mas não fornece sua forma gráfica. Não usamos emojis como informação única.

Linhas de fotos são medidas por inteiro antes da quebra; legendas muito longas usam largura completa e continuam em páginas seguintes. Fotos mantêm proporção. Falha de imagem gera placeholder na prévia e bloqueia a versão final. Conteúdo completo de N/A e não testado permanece no ambiente. Campos de assinatura são manuais; o produto não afirma assinatura eletrônica.

## Reprodução e evidências

- `pnpm test:vistoria`: modelo, persistência/transações, revisão, PDF e migrações reais 0033/0034/0035 em PostgreSQL isolado (PGlite).
- `pnpm preview:vistoria`: harness local sem conexão de produção, usando os componentes reais com sessão/transporte/gravação de fixture. Abrir `/tests/vistoria/preview.html?state=list`, `state=new` ou `state=room`. `&offline=1` simula falha do transporte; `&testing=1` expõe refetch e contador de encerramentos do gravador de fixture.
- `node tests/vistoria/prepare-baseline.mjs`: extrai as três rotas do commit c6a53a3d em `tmp/vistoria-baseline/` para `/tests/vistoria/baseline.html?state=...`. O harness anterior usa o transporte isolado e não prova a jornada autenticada nem substitui uma captura do shell original.
- `tsx tests/vistoria/generate-pdf.ts`: gera a amostra fictícia em `docs/vistoria-evidencias/laudo-demonstracao.pdf`. Renderizar com `pdftoppm` e conferir **todas** as páginas, além dos testes de margens/conteúdo.
- [Registro de validação e limites](vistoria-evidencias/README.md).

## Como ligar a voz

Hoje o botão Voz **grava e guarda** os áudios; a transcrição fica "aguardando ativação".

1. Conectar a IA do Lovable no conector de IAs (disponibiliza `LOVABLE_API_KEY` no servidor).
2. Definir o segredo/variável de servidor `VISTORIA_VOZ_ATIVA=true`.
3. Opcional: `VISTORIA_TRANSCRIBE_MODEL` (padrão `openai/gpt-transcribe`, endpoint `/v1/audio/transcriptions`) e `VISTORIA_ORGANIZE_MODEL` (padrão `openai/gpt-6-astra`, `/v1/responses` com JSON estrito).
4. Áudios já gravados podem ser transcritos pelo botão "Transcrever agora" em cada relato.

### GPT-Live 1 (conversa ao vivo)

Ainda **não está ligado**. O adaptador já reporta o estado (`voiceStatus().live`) como não configurado. Falta: relay de sessão `/v1/live/sessions` no servidor com delegação ao cliente (padrão do skill de Live voice: `live-relay.server.ts`, hook `use-live-voice.ts`, adaptador Vite), variável `VISTORIA_LIVE_ATIVA=true`, e prompt limitado a perguntas curtas de itens faltantes e sugestões — nunca concluir laudo ou alterar itens sozinho. Web Speech do navegador não é usado.

## Limitações verificadas

- A representação gráfica de caracteres fora de WinAnsi usa o fallback de códigos Unicode descrito acima; leitores reais adicionais ainda precisam ser conferidos.
- Envio em segundo plano no iOS não é garantido: a fila retoma ao reabrir a tela, ao voltar ao app e ao reconectar.
- A data das fotos é a do momento em que foram adicionadas no app; o EXIF não é lido.
- Download no iPhone usa compartilhar arquivo quando disponível; senão abre o PDF em nova aba.
