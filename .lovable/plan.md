# Descontos e ajustes no recibo de aluguel (Emitir recibo)

Escopo: somente Aluguéis → Emissões → Emitir recibo. NF, boleto, sync ImobiBrasil e cadastro de contrato não são tocados. Migração só aditiva. Nada publicado sem autorização.

## O que o usuário verá
- Nova seção "Descontos e ajustes do inquilino": itens com Desconto/Acréscimo, descrição (até 60), valor, "Repassar ao proprietário" (ligado por padrão), "Repetir todo mês" (com "até competência" opcional) e remover. Recorrentes do contrato chegam pré-carregados com selo "Recorrente"; remover no mês não apaga o recorrente.
- Nova seção "Descontos do proprietário": Desconto/Acréscimo, descrição, valor, comprovante opcional (PDF/JPG/PNG até 5 MB).
- Resumos "Inquilino paga" / "Proprietário recebe" discriminam cada item com sinal, recalculados ao vivo.
- Honorários continuam iguais (valor do contrato, editável).
- Bloqueio com mensagem quando: descrição vazia, valor ≤ 0, mais de 10 itens por lado, recorrência com fim antes do início, ou total negativo ("Os descontos não podem deixar o total negativo.").

## Cálculo (centavos), em `receipt-model.ts`
- `totalPagar` = aluguel + condomínio + IPTU + seguro + Σ(acréscimos − descontos do inquilino)
- `totalReceber` = aluguel − honorários + condomínio + Σ(itens do inquilino repassados, com sinal) + Σ(acréscimos − descontos do proprietário)
- Novos campos opcionais em `ReceiptInput`: `ajustesInquilino`, `ajustesProprietario` (ausentes = `[]`), então recibos sem ajustes saem idênticos.
- `defaultReceiptInput` recebe opcionalmente os recorrentes ativos da competência (início ≤ competência ≤ fim).
- Função pura `validateReceiptAdjustments` reutilizada no modal, no servidor e nos testes.

## PDF (`receipt-pdf.ts`)
- Via locatário: linhas atuais + itens do inquilino ("Desconto – Fundo de reserva  − R$ 15,00").
- Via locador: linhas atuais + itens repassados + itens do proprietário.
- Via imob: valores já ajustados + linha "Ajustes: inquilino … / proprietário …" quando houver.
- Limite de linhas por via calculado pelo espaço; excedentes viram "Outros ajustes (n)" com a soma. Sem ajustes = desenho atual sem mudança. Logos, CNPJ e fontes não mudam.

## Persistência
- Migração aditiva `rental_contract_adjustments` (recorrentes): id, contract_id (FK cascade), tipo (desconto/acrescimo), descricao (1–60), valor numeric(12,2) > 0, repassar_proprietario default true, inicio_competencia, fim_competencia null, ativo default true, created_by, created_at, updated_at; gatilho de validação fim ≥ início e updated_at; GRANTs (authenticated, service_role); RLS espelhando o acesso atual de `rental_emissions` (conferido no banco antes de aplicar); política restritiva `meta_reviewer_block`.
- `rental_emissions.valores` ganha os dois arrays + totais no jsonb (sem coluna nova).
- Comprovantes no bucket `rental-documents` em `{contractId}/recibos/comprovantes/{competencia}-{ts}-{uuid}.{ext}`, usando o helper de envio já existente.

## Servidor (`emissions.functions.ts`)
- `registerRentalReceipt`: schema zod estrito para os arrays; carrega o contrato, recalcula com `buildReceiptModel` e rejeita totais divergentes; valida prefixo/extensão de cada comprovante.
- Novas: `listContractAdjustments`, `upsertContractAdjustment`, `deactivateContractAdjustment` (desativação, sem apagar), todas autenticadas.

## Modal e orquestração
- `ReceiptModal.tsx`: duas seções novas e resumos discriminados.
- `RentalEmissions.tsx`: carrega recorrentes, envia comprovantes antes do PDF, salva novos recorrentes marcados, e o `inputKey` de idempotência inclui os ajustes.

## Testes (`receipt-model.vitest.ts`, `bun run test:receipts`)
- Sem ajustes: 1.787,80 / 178,78 → pagar 1.787,80, receber 1.609,02.
- Fundo de reserva 15,00 repassado → 1.772,80 / 1.594,02; honorários 178,78.
- Não repassado → 1.772,80 / 1.609,02.
- + reparo 120,00 do proprietário → receber 1.474,02.
- Multa 35,76 repassada → 1.823,56 / 1.644,78.
- Precisão 0,10 + 0,20.
- Erros: descrição vazia, valor ≤ 0, total negativo, >10 itens, fim < início.
- `valores` legado sem arrays aceito.
- PDF com 6 itens por lado gera sem erro e contém os textos.
- Conferência do servidor (função pura extraída) rejeita totais divergentes e comprovante fora do prefixo.

## Fora do escopo
NFS-e (`src/lib/nfse/*`, `RentalNfseSection.tsx`), boleto, ImobiBrasil, layout geral do PDF. A diferença já conhecida de fonte do telefone/CNPJ (8–8,5pt vs. regra 9–10pt) não será mexida sem sua decisão.
