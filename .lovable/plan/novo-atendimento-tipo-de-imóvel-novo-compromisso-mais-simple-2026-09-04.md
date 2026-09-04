# Novo atendimento: tipo de imóvel + Novo compromisso mais simples

## 1. Tipo de imóvel "Sítio / chácara"

Nova opção "Sítio / chácara" na lista de tipo de imóvel do Novo atendimento, junto de Casa, Apartamento, Terreno, Sala comercial e Área rural. Cadastros antigos continuam iguais; textos de e-mail, filtros e relatórios passam a mostrar o novo nome corretamente.

## 2. Novo compromisso (Agenda) — tela mais curta

- Sai o bloco 6 "Checklist e observações".
- Sai o bloco 5 "Convidados externos".
- O formulário passa a ter 4 blocos: Tipo e título, Data e horário, Imóvel, Responsáveis.

### Bloco 3 — Imóvel (refeito)

- Some o seletor de cliente e o de atendimento.
- Um campo de busca onde a pessoa digita o código (Cordial ou Morar), o bairro ou o título; a lista de resultados vem direto do menu Imóveis, com foto/código/bairro e valor.
- Ao escolher, o compromisso já guarda o imóvel, o endereço e mostra um cartão com o proprietário (nome e telefone) puxado da ficha do imóvel, com botão para trocar de imóvel.
- Continua sendo possível seguir sem imóvel (compromissos internos), e o campo Imobiliária permanece.

### Bloco 4 — Responsáveis (mais fácil)

- Um único campo com busca e rolagem: digita parte do nome, marca quem participa, os escolhidos viram etiquetas removíveis logo acima.
- O responsável principal continua sendo quem cria o compromisso.

## Detalhes técnicos

- `src/types/atendimento.ts`: novo valor `sitio_chacara` em `TipoImovelInteresse` e em `atendimentoTipoImovelOptions`; `normalizeTipoImovel` em `src/services/atendimentos.ts` reconhece "sitio"/"chácara"; rótulo em `src/lib/attendances/email.functions.ts`. A coluna `tipo_imovel` é texto, sem migration.
- `src/components/agenda/AgendaFormModal.tsx`: remover as `FormSection` 5 e 6 e renumerar; manter os campos `checklist`, `convidados` e `observacoes` no estado/envio como listas vazias/valor atual para não quebrar `AgendaEventInput`, o sync do Google Agenda nem eventos já criados.
- Busca de imóvel: usar o server fn existente `listImoveis` (`src/lib/imoveis/imoveis.functions.ts`, já aceita `search`) via novo hook com debounce, em vez do store mockado `useApp().imoveis`. O proprietário vem de `getPropertyDetail` / campos `proprietario_nome` e `proprietario_telefone`.
- Persistência: continua usando as colunas já existentes `imovel_id`, `imovel_nome`, `imovel_endereco`, `imovel_descricao` em `agenda_events`; o proprietário é gravado em `imovel_descricao` e reexibido a partir do imóvel quando disponível. Sem mudança de schema, RLS ou fila de publicação.
- Sem alteração em serializers/API Cordial-Morar, Drive, funil, notificações push ou Google Agenda.
