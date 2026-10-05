# Guardar o PDF de toda NFS-e emitida no histórico do aluguel

## Como vai funcionar
1. Quando a prefeitura confirma uma nota **emitida**, o sistema baixa o PDF oficial pelo link que a própria prefeitura devolve (só do endereço oficial de Santa Rosa) e guarda o arquivo no aluguel.
2. Em **Documentos** do aluguel aparece uma nova pasta, **"Notas fiscais (NFS-e)"**. O nome de cada arquivo segue o padrão `NFS-e 123 - Cordial - 09-2026.pdf`.
3. No **Histórico por competência** da NFS-e, cada nota emitida ganha o botão **"Abrir PDF"**, que abre a cópia guardada no sistema e não depende do site da prefeitura.
4. Se o download falhar (prefeitura fora do ar, por exemplo), a nota continua registrada normalmente e aparece o aviso "PDF pendente", com o botão **"Baixar PDF novamente"**. Uma rotina automática também tenta de novo a cada hora para as notas sem PDF.
5. Cada nota guarda **um único PDF**: repetir a tentativa não cria cópia duplicada.
6. Se a pasta do aluguel no Google Drive estiver ligada, o PDF vai para lá também, como já acontece com os outros documentos.
7. O PDF da nota não pode ser apagado pela tela de documentos, porque é registro fiscal.

## Testes (modo teste)
A prefeitura **não gera PDF** para envios em modo teste, porque eles não têm valor fiscal. Nesses casos o histórico mostra "Teste sem PDF oficial" e nenhum arquivo é guardado. O PDF passa a aparecer nas notas reais.

## Notas já existentes
Hoje não há nenhuma nota real emitida (só testes e erros), então não há nada antigo para recuperar.

## Detalhes técnicos
- Migração (somente adição):
  - incluir `nota_fiscal` no CHECK de `rental_contract_documents.category` (recriar a constraint com a lista atual mais o novo valor);
  - nova coluna `rental_nfse_emissions.pdf_document_id uuid null` com referência a `rental_contract_documents(id)`, mais `pdf_status text default 'nao_aplicavel'` (`pendente`/`salvo`/`falhou`) e `pdf_last_error text null`;
  - índice único parcial em `pdf_document_id`;
  - gatilho que impede DELETE de documento de categoria `nota_fiscal` por usuários (só `service_role`).
- Novo `src/lib/nfse/pdf-archive.server.ts`, função `archiveNfsePdf(admin, emissionId)`, idempotente:
  - lê a emissão, só processa se `status='emitida'`, `modo_teste=false`, `link_pdf` válido por `safeNfseDocumentUrl` e sem `pdf_document_id`;
  - faz o fetch com timeout e confere que é `application/pdf` (assinatura `%PDF`, até 10 MB);
  - grava no bucket `rental-documents` em `<contractId>/nfse/<emissionId>.pdf`, cria a linha em `rental_contract_documents` (categoria `nota_fiscal`) e grava `pdf_document_id`/`pdf_status='salvo'`;
  - em caso de falha, grava `pdf_status='falhou'` e o erro, e nunca altera status, número ou valores fiscais da nota.
- Chamada em `nfse.functions.ts` logo depois da gravação de `emitida` (em try/catch, sem interromper a resposta).
- Nova função de servidor `retryNfsePdf({ emissionId })` para o botão de nova tentativa, com acesso ao contrato verificado.
- Novo `src/routes/api/public/hooks/nfse-pdf-retry.ts`: autenticado por `internal_worker_headers()`, processa até 20 notas `pendente`/`falhou`. Agendamento por pg_cron, de hora em hora.
- `src/types/rental.ts`: categoria `nota_fiscal` ("Notas fiscais (NFS-e)") marcada como somente sistema, sem botão de envio manual nem de apagar em `RentalDocuments.tsx`.
- `RentalNfseSection.tsx`: estado do PDF e botões "Abrir PDF" / "Baixar PDF novamente".
- Testes unitários: validação do link e do arquivo, idempotência e nome do arquivo. Rodar test:nfse e typecheck.
- Nada é emitido nem alterado nas notas existentes, e o modo teste continua ligado.
