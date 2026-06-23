## Objetivo
Hoje "Transformar em cliente" só marca o atendimento como `convertidoEmCliente=true`, sem criar nada no menu **Clientes**. Vou refazer o fluxo para realmente promover o atendimento a um cadastro de cliente, registrar isso no histórico do atendimento e deixar o registro disponível na tela de Clientes.

## Fluxo novo
1. Usuário clica em **Transformar em cliente** no card de atendimento.
2. Confirmação (mantém o `AlertDialog` atual).
3. Sistema:
   - Cria um registro em `clients` usando os dados do atendimento (nome, telefone, e-mail, imobiliária, origem, finalidade, tipo de imóvel, dormitórios, bairro, orçamento, corretor, observações).
   - Atualiza o atendimento com `convertidoEmCliente=true` e `clienteConvertidoId=<id do novo cliente>`.
   - Acrescenta uma linha ao histórico (campo `observacoes` com prefixo `[dd/mm HH:mm] Cliente vinculado: <nome>` — mesmo padrão usado por "Registrar histórico").
4. Toast: "Cliente cadastrado em Clientes." com confirmação.
5. Botão passa a mostrar "Cliente vinculado" (já existe).
6. Caches de `['attendances']` e `['clients']` são invalidados para refletir nos dois menus.

## Mapeamento atendimento → cliente
| Atendimento | Cliente |
|---|---|
| `clienteNome` | `fullName` |
| `telefone` | `phone` |
| `email` | `email` |
| `contatoPreferencial` | `contactPreference` |
| `origem` | `leadOrigin` |
| `imobiliaria` | `brand` |
| `corretorId` / `corretorNome` | `assignedBrokerId` / `assignedBrokerName` |
| `finalidade` (`venda`→`compra`, demais 1:1) | `purpose` |
| `tipoImovel` | `propertyType` |
| `dormitorios` | `bedrooms` |
| `bairroInteresse` | `neighborhood` |
| `orcamentoMin/Max` | `minBudget/maxBudget` |
| `observacoes` + `historicoInicial` | `notes` |
| `proximoPasso`, `proximoRetorno` | `nextStep`, `nextFollowUpAt` |
| `status` (mapeado) | `status` |
| `clientType` | default `comprador` (não existe no atendimento) |

Se já existir `clienteConvertidoId` no atendimento, apenas avisa e não duplica.

## Alterações
- **`src/hooks/useAttendances.ts`** — `convertAtendimento(id)`:
  1. Lê o atendimento atual do cache.
  2. Chama `createClient` (server fn) com o payload mapeado.
  3. Chama `updateAttendance` com `convertidoEmCliente`, `clienteConvertidoId` e `observacoes` atualizadas.
  4. Invalida `['attendances']` e `['clients']`.
- **`src/components/atendimentos/AtendimentoCard.tsx`** — sem mudança de UI, só ajuste da mensagem do toast/confirm para refletir que o cadastro vai para Clientes.
- **`src/routes/_app.atendimentos.tsx`** — toast atualizado ("Cadastro criado em Clientes.").
- Nenhum migration novo, nenhum componente novo, nenhuma mudança no menu Clientes (já lista tudo de `clients`).

## Validação
- `tsgo --noEmit`.
- Manual: criar atendimento → Transformar em cliente → conferir no menu Clientes e no histórico do card.
