# Vistoria inteligente

Módulo de vistorias (entrada, saída, periódica, constatação) com checklist por ambiente, fotos, relatos por voz/texto, revisão e laudo em PDF versionado. Prioridade: celular.

## Fontes de pesquisa
- IBRESP — *Como realizar uma boa vistoria imobiliária* (checklist por cômodo, materiais/cores, testes elétricos/hidráulicos, comparação entrada/saída).
- Superlógica — vistoria pelo sistema de gestão (identificação, entrada/saída, vistoriador, medidores, mobiliado/limpeza, PDF com fotos).
- Kenlo Vistorias — avaliação por ambiente/item, fotos amplas + pontuais, material/cor, medidores e fornecimento, revisão posterior.
- Documentação Lovable AI — GPT Transcribe (áudio→texto) e GPT-Live 1 (conversa bidirecional); gravações longas em segmentos.

## Acesso
- Menu "Vistoria inteligente" (seção Operação; no celular, em "Mais") para administrador, secretaria e corretor (`AppModule "vistorias"`).
- Corretor: só vistorias que criou ou das quais é responsável; não atribui a outra pessoa. Admin/secretaria: todas, e podem escolher o responsável.
- Espelhado no banco: RLS em todas as tabelas (`inspection_can_access`, `inspection_can_edit`) e no bucket privado `inspection-media`. Nenhuma chave de serviço no navegador; URLs de arquivos são temporárias (assinadas).

## Modelo de dados (Drizzle 0033/0034)
`inspections` → `inspection_rooms` → `inspection_items`; `inspection_media`, `inspection_notes`, `inspection_documents`, `inspection_events`.
- FKs compostas: item/foto/relato só podem apontar para cômodo da **mesma** vistoria; foto/relato de item só para item do **mesmo** cômodo.
- Caminho de arquivo obrigatório `<vistoria>/<cômodo>/<chave>` (CHECK no banco + validação no servidor); IDs, cômodo e caminho são imutáveis (gatilho).
- Idempotência: vistoria com id gerado no aparelho; foto/relato com `client_key` único por vistoria.
- Controle otimista: cada linha tem `revision`; gravação com revisão antiga devolve conflito ("mudou em outra tela") em vez de sobrescrever.
- Snapshot da identificação do imóvel na criação (`property_snapshot.cadastro` + `confirmado`). O cadastro do imóvel **nunca** é alterado.

## Etapas
1. **Lista**: cartões por status, busca por código/endereço, filtros tipo/data, paginação de 20.
2. **Criação**: escolher imóvel; tipo, data/hora local, imobiliária do laudo, responsável, participantes, mobiliado, limpeza, chaves e medidores (água/luz/gás: não informado ≠ zero; "não aplicável" e "fornecimento desligado" explícitos). Quantidades viram sugestão editável e a planta precisa ser confirmada.
3. **Planta sugerida**: convenção do cadastro — `dormitorios` inclui suítes e `banheiros` inclui os das suítes (3 dorm./1 suíte = Suíte + Banheiro da suíte + 2 Dormitórios). Terreno gera só "Terreno"; comercial gera salas comerciais/banheiros/fachada; tipo desconhecido não gera nada.
4. **Execução**: ambientes em abas horizontais; itens com estados Bom/Regular/Ruim/Não testado/Não se aplica (todos começam **Pendente**); Ruim exige descrição da avaria, Não testado exige motivo. Barra inferior Câmera / Galeria / Voz / Digitar / Próximo com safe-area.
5. **Fotos**: redimensionadas para 2048 px e regravadas em JPEG (orientação aplicada, EXIF/GPS removidos); data registrada é a de captura/importação no app (não lida do EXIF). Ficam primeiro no IndexedDB (por usuário+vistoria), sobem uma por vez, o servidor confere bytes/tamanho/pertencimento e só então removemos a cópia local. Falha mostra "Tentar de novo"; nada é descartado.
6. **Voz/texto**: gravação PCM → WAV completo (compatível com iOS/Android), segmentos de 60 s, contexto travado (vistoria+cômodo+sessão). Trocar de cômodo encerra e salva o trecho no cômodo de origem. Separação: áudio original → transcrição original → sugestão organizada (elemento/material/cor/estado/avaria/local/teste, só com o que foi dito) → texto aprovado. Nada muda item sem clique explícito ("Adicionar" ao item ou "Aprovar relato"). Resposta atrasada nunca preenche outro cômodo.
7. **Revisão**: lista clicável de pendências (itens, não testados sem motivo, avarias sem descrição, ambientes sem foto/motivo, fotos não confirmadas, relatos não revisados, arquivos só no aparelho, dados básicos, planta).
8. **PDF**: pdf-lib carregado sob demanda, A4, identidade Cordial/Morar, cabeçalho/rodapé/paginação, todos os ambientes/itens, medidores, chaves, relatos (transcrições não revisadas identificadas), registro fotográfico numerado por ambiente com referência das avarias, conclusão e linhas de assinatura **manual** (sem alegar validade jurídica). Rascunho marcado "RASCUNHO"; foto que falhar aparece como "indisponível" no rascunho e **bloqueia** o final com a lista das fotos.
9. **Conclusão**: o PDF final é enviado como `docs/v<n>-<hash>.pdf` e a RPC `inspection_finalize` revalida tudo, registra documento + snapshot e muda o status numa transação. Versões emitidas não são sobrescritas; reabrir exige motivo e a próxima conclusão gera v<n+1>.

## Como ligar a voz
Hoje o botão Voz **grava e guarda** os áudios; a transcrição fica "aguardando ativação".
1. Conectar a IA do Lovable no conector de IAs (disponibiliza `LOVABLE_API_KEY` no servidor).
2. Definir o segredo/variável de servidor `VISTORIA_VOZ_ATIVA=true`.
3. Opcional: `VISTORIA_TRANSCRIBE_MODEL` (padrão `openai/gpt-transcribe`, endpoint `/v1/audio/transcriptions`) e `VISTORIA_ORGANIZE_MODEL` (padrão `openai/gpt-6-astra`, `/v1/responses` com JSON estrito).
4. Áudios já gravados podem ser transcritos pelo botão "Transcrever agora" em cada relato.

### GPT-Live 1 (conversa ao vivo)
Ainda **não está ligado**. O adaptador já reporta o estado (`voiceStatus().live`) como não configurado. Falta: relay de sessão `/v1/live/sessions` no servidor com delegação ao cliente (padrão do skill de Live voice: `live-relay.server.ts`, hook `use-live-voice.ts`, adaptador Vite), variável `VISTORIA_LIVE_ATIVA=true`, e prompt limitado a perguntas curtas de itens faltantes e sugestões — nunca concluir laudo ou alterar itens sozinho. Web Speech do navegador não é usado.

## Limitações verificadas
- Fontes do PDF: Helvetica padrão (WinAnsi). Acentos do português funcionam; símbolos fora desse conjunto (ex.: emoji) viram "?".
- Envio em segundo plano no iOS não é garantido: a fila retoma ao reabrir a tela, ao voltar ao app e ao reconectar.
- A data das fotos é a do momento em que foram adicionadas no app; o EXIF não é lido.
- Download no iPhone usa compartilhar arquivo quando disponível; senão abre o PDF em nova aba.
