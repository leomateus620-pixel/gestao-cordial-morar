# Agenda de Fotos — novo cadastro simplificado

Reformular apenas o cadastro da rota `/agenda/fotos`. A Agenda Geral (`/agenda`), o Google Agenda, os lembretes e os eventos já existentes ficam intactos.

## Como o novo cadastro vai funcionar

Três blocos, nada mais:

1. **Fotos de imóveis** — chip fixo com ícone de câmera (sem seletor de tipo) e apenas o campo Título. Sem descrição curta.
2. **Data e horário** — data, horário de início, status e prioridade. Duração padrão e lembretes automáticos seguem exatamente como hoje.
3. **Referência do imóvel** — Link do imóvel, Foto ou print do imóvel, Endereço do imóvel (placeholder "Rua, número, bairro ou ponto de referência").

Sai da tela: busca de imóvel no banco, proprietário automático, seletor de imobiliária e todo o bloco de Responsáveis. O responsável aparece só como texto ("Responsável: Nome · Definido automaticamente").

Cabeçalho: **Nova sessão de fotos** / "Defina horário, endereço e a referência do imóvel." Resumo dinâmico logo abaixo, escondendo o que estiver vazio. Steps: `1 Dados`, `2 Data e horário`, `3 Imóvel`.

Botões: **Agendar fotos** (novo), **Salvar alterações** (edição), **Salvando...** durante o envio.

## Link e foto no mesmo fluxo

- A foto escolhida fica em memória com preview imediato; nada é enviado antes de salvar.
- Ao salvar: cria o compromisso → grava o link de referência → envia a imagem para a pasta do compromisso → registra o anexo → só então mostra concluído.
- Se a imagem falhar depois de o compromisso existir, mostramos "Agendamento criado, mas não foi possível salvar a imagem. Tente novamente." e o botão tenta de novo no mesmo compromisso, sem criar outro e sem duplicar anexo.
- Na edição, link e foto já existentes aparecem preenchidos, com Trocar e Remover.
- Estados do campo de imagem: vazio ("Adicionar foto ou print"), selecionado (preview + nome + Trocar + Remover), enviando ("Salvando imagem..."), erro.
- Link válido mostra ação discreta **Abrir link** (nova aba, `noopener noreferrer`).

## Regras garantidas no servidor

- Novo evento criado pela Agenda de Fotos: `tipo = fotos`, `imobiliaria = ambas`, `owner_user_id = usuário autenticado` (ignora qualquer responsável enviado pela tela) — ou seja `created_by = owner_user_id`.
- Editar um compromisso **não** transfere o responsável: `owner_user_id` original é preservado.
- Link aceito somente `http`/`https`; anexo somente imagem, com tamanho máximo e caminho obrigatoriamente dentro da pasta do próprio compromisso.
- Armazenamento continua privado; a imagem nunca vai para os sites Cordial/Morar.

## Card da agenda de fotos

Na variante `fotos`: sem o selo "Ambas"; mantém responsável, horário, status e prioridade; endereço em destaque; indicação discreta quando existe link de referência. O card da Agenda Geral não muda. Os metadados de referência são carregados em lote junto da listagem — nenhuma consulta por card.

## Detalhes técnicos

**Novo arquivo** `src/components/agenda/AgendaPhotoFormModal.tsx`, usado por `src/routes/_app.agenda.fotos.tsx`. Reaproveita `Field`, estilos, animações, footer e comportamento de modal do `AgendaFormModal`, que permanece sem condicionais novas e serve só a Agenda Geral. Nada de `listImoveis` / `usePropertyDetail` nessa modal.

**Migration (não destrutiva)** em `agenda_event_attachments`:
- coluna `purpose text not null default 'general'` com valores `general` | `property_reference` (anexos existentes ficam `general`);
- índices únicos parciais garantindo no máximo 1 foto e 1 link `property_reference` por evento;
- políticas atuais mantidas.

**Server functions** (`src/lib/agenda/agenda-attachments.functions.ts`): `registerAgendaPhoto` e `addAgendaLink` passam a aceitar `purpose` e, para `property_reference`, fazem substituição idempotente (remove o anterior e grava o novo, sem duplicar em retry); nova leitura em lote das referências para a listagem.

**`src/lib/agenda/agenda.functions.ts`**: no insert, quando o evento vier da agenda de fotos, o servidor força `tipo`, `imobiliaria = 'ambas'` e `owner_user_id = context.userId`; no update, `owner_user_id` nunca é sobrescrito pelo editor. Lembretes, duração e sincronização com Google Agenda permanecem no mesmo caminho de hoje.

**Layout**: desktop com largura máxima ~900px, Dados e Data/Horário lado a lado, Referência do imóvel em largura total, preview da imagem em 16:9. Mobile em coluna única, full-screen/bottom-sheet, toques de 44–48px, respeitando `safe-area-inset`, com header/footer estáveis e sem overflow horizontal. Transições de 160–220ms.

## Validação antes de entregar

Criação com: título + data/hora + endereço; título + link; título + foto; tudo junto; imagem grande dentro do limite; URL inválida; falha e retry de upload; troca e remoção da foto; edição do link; refresh após salvar; desktop e mobile.

Conferência no banco: `tipo = fotos`, `imobiliaria = ambas`, `created_by = owner_user_id` nos novos, uma única foto e um único link de referência, sem anexos duplicados, eventos antigos (incluindo os antigos de vídeo) intactos.

Conferência de não regressão: Agenda Geral idêntica, Google Agenda sincronizando, lembretes funcionando, e quem apenas editar um compromisso não passa a ser o responsável. Revisão visual real da modal em desktop e mobile, corrigindo qualquer corte, desalinhamento ou sobra de espaço.
