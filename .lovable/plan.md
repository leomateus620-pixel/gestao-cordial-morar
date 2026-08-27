# Etapa 7 — Agenciamento dentro do cadastro de imóveis

## Mapa de impacto (o que já existe e será reutilizado)

- Wizard de imóveis: `src/components/imoveis/PropertyForm.tsx` (6 etapas, estado local + rascunho criado sob demanda em `src/routes/_app.imoveis.novo.tsx`).
- Domínio de agenciamentos: tabela `agenciamentos` (checklist em colunas booleanas: `fotos_horizontal`, `fotos_vertical`, `fotos_drive`, `placa_instalada`, `cadastrado_morar`, `cadastrado_cordial`, `video_realizado`, `validado`), server fns em `src/lib/agenciamentos/agenciamentos.functions.ts`, mapeadores em `agenciamentos.server.ts`, UI em `src/components/agenciamentos/*`.
- Motor de bonificação: já é 100% no banco — funções `agenciamento_bonus_recalc`, `agenciamento_bonus_notify` e trigger `agenciamentos_bonus_sync`, gravando em `agenciamento_bonuses`. Nenhuma regra de meta será reescrita no frontend; o novo fluxo apenas insere na mesma tabela e o trigger recalcula.
- Publicação: `src/lib/imoveis/publish.functions.ts` + worker `src/lib/imobibrasil/sync.server.ts`, com estado por provedor em `property_provider_publications.status` (`published` só após verificação remota por GET).
- Fotos: `property_images` (tem `width`/`height`, `processing_status`, marca-d'água obrigatória).

Lacunas confirmadas na auditoria: `agenciamentos` **não** tem `property_id`, nem `source`, nem chave de idempotência. Não existe Drive para imóveis (só aluguéis), então "Fotos enviadas ao Drive" continua manual.

## O que será construído

### 1. Migration (pequena, retrocompatível)

Em `agenciamentos`:
- `property_id uuid null references properties(id) on delete set null`
- `source text not null default 'manual'` (`manual` | `property_registration`)
- `source_operation_key text null` com índice único parcial (`where source_operation_key is not null`)
- índice em `property_id`

Registros antigos continuam válidos com `property_id = null`. Nenhum backfill automático por endereço.

### 2. Operação transacional idempotente

Nova função de banco `finalize_property_agency_listing(...)` (SECURITY DEFINER, valida `auth.uid()`), chamada por uma server fn `finalizePropertyAgency` autenticada:

- deriva `created_by` de `auth.uid()`; corretor responsável = perfil do usuário autenticado; admin/secretaria podem escolher outro corretor elegível (mesma regra de `list_assignable_brokers`);
- chave idempotente `property:{id}:initial-agency-listing` → se já existir, faz update e devolve o mesmo ID (retry/duplo clique não duplica);
- grava checklist manual, classificação, data operacional, descrição interna;
- não chama API externa; a publicação continua pela fila existente (`enqueuePropertySync`), disparada depois do commit.

### 3. Checklist compartilhada

Extrair a definição de itens hoje embutida em `AgenciamentoFormModal.tsx` para um módulo de domínio (`src/lib/agenciamentos/checklist.ts`) + componente `AgencyChecklist` usado pelo modal atual **e** pela Etapa 7 — uma única fonte de verdade.

Regras de preenchimento automático:
- `Fotos realizadas (horizontal/vertical)`: marcado automaticamente só quando existir foto pronta com `width`/`height` conhecidos indicando a orientação; sem dimensão, permanece manual com aviso "fotos já anexadas ao imóvel".
- `Imóvel cadastrado Morar` / `Cordial`: geridos pelo sistema, marcados apenas quando `property_provider_publications.status = 'published'`. Enquanto isso: "Aguardando publicação" / "Publicação com erro" + retry. Provedor não selecionado = "Não se aplica" e sai do denominador do progresso.
- `Fotos enviadas ao Drive`, `Placa instalada`: manuais (não há fonte confiável hoje).
- `Vídeo realizado`: manual (não há mídia de vídeo no modelo).

### 4. Eventos da sincronização → checklist

No worker/reconciliador, ao confirmar `published` para um provedor, um handler idempotente localiza o agenciamento vinculado por `property_id` e marca só o item daquele provedor. Trigger de bônus já existente recalcula validade uma única vez. Despublicação registra o evento e atualiza o item conforme a política atual, sem apagar histórico de bônus pago.

### 5. Etapa 7 na UI

Nova etapa no mesmo wizard (sem modal), com:
- toggle "Registrar também o agenciamento deste imóvel" (ligado por padrão para quem pode criar agenciamento; oculto/read-only para quem não pode);
- resumo read-only dos dados já preenchidos (imóvel, códigos, finalidade, endereço, proprietário, corretor, data, destinos, fotos prontas, situação de publicação) com atalho "Editar" para a etapa de origem;
- classificação Venda/Aluguel derivada da finalidade do imóvel; escolha explícita quando o imóvel tem as duas;
- checklist compartilhada + descrição interna;
- progresso e estimativa textual ("Com os dados atuais, o agenciamento ficará pendente por 2 itens"), sem prometer bonificação.

CTA final vira "Cadastrar imóvel e registrar agenciamento". Após sucesso: cartões de estado independentes (Imóvel salvo / Agenciamento registrado / Cordial / Morar / Checklist) com ações Abrir imóvel, Ver agenciamento e Ir para Agenciamentos. Mobile: coluna única, resumo recolhível, alvos de toque ≥44px, barra de ação fixa.

Rascunho preserva os valores da Etapa 7 sem criar agenciamento contabilizável. Ficha do imóvel mostra o agenciamento vinculado; ficha do agenciamento abre o imóvel.

### 6. Privacidade do payload

Auditar `mapPropertyTo*Payload` para garantir allowlist explícita e adicionar teste de contrato: nenhum campo de agenciamento (checklist, descrição interna, IDs, elegibilidade) aparece no JSON enviado a Cordial/Morar.

### 7. Testes

Unitários/integração para: idempotência da finalização, responsável derivado do backend, provedor "não se aplica" no progresso, marcação automática só após `published`, classificação Venda×Aluguel usando o motor do banco, e os testes de contrato de payload.

## Observação técnica

O motor de bonificação vive em PL/pgSQL e depende de `fotos_horizontal AND fotos_vertical AND cadastrado_morar AND cadastrado_cordial`. Isso significa que, hoje, um imóvel publicado só na Cordial nunca vira bonificável. Não vou mudar essa regra sem sua decisão — o plano mantém o motor intacto e a Etapa 7 apenas mostra a pendência real.
