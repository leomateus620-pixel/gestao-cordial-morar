# Fiadores com cônjuge, contrato salvo e vistorias de entrada/saída

Fluxo: cadastro e garantias → checklist concluído → contrato salvo e conferido → vistoria de entrada concluída → vistoria de saída liberada.

## Etapa 1 — Cônjuge por fiador
- Em cada card de Fiador: "Incluir esposa/cônjuge na assinatura" (desligado), opção Esposa / Outro cônjuge, campos nome, CPF, RG, profissão, telefone.
- Dados presos ao fiador daquele contrato (id estável; sobrevive a excluir/reordenar/editar). Nada para caução ou seguro-fiança.
- Validação no servidor (CPF válido, obrigatórios, RG livre). Incompleto: salva rascunho, mas bloqueia geração com pendência. Desligar retira da próxima versão; versões antigas ficam.
- Prévia e Word: qualificação e linha de assinatura do cônjuge logo após o seu fiador, com o papel do modelo aprovado ("cônjuge anuente"). Não vira fiador. Telefone só no cadastro.

## Etapa 2 — Documentos do aluguel e checklist
Ordem na ficha e no cadastro:
1. Contrato de aluguel — Checklist do contrato, Gerar contrato, Anexar contrato existente.
2. Termo de vistoria de entrada — Iniciar / Continuar / Ver termo.
3. Termo de vistoria de saída (no lugar de "Check-list aluguel") — mostra o motivo do bloqueio.
4. Apólice, Notas fiscais (NFS-e), Outros — sem mudança.
- Arquivos antigos de checklist e termos genéricos continuam visíveis; classificar como entrada/saída só por ação explícita de admin/secretária, nunca pelo nome do arquivo.
- Checklist com pendências clicáveis (imóvel, partes, condições, garantia), conforme o modelo correto; cônjuge só se ativado. Mudar dados usados pelo checklist desfaz a conferência.
- Novo aluguel: salva como rascunho para ter a ficha antes de gerar; voltar retoma a mesma ficha. Checklist incompleto não impede salvar.
- Gerador: mantém prévia e Word; novo botão "Confirmar e salvar contrato". Sucesso só aparece depois que o arquivo está registrado no aluguel (corrige a mensagem falsa de hoje). Falha: oferece tentar de novo sem perder dados. Clique duplo e nova tentativa não duplicam (chave única por versão).
- Confirmar a versão salva registra a conferência e libera a entrada. Contrato externo continua com "Marcar como conferido". Estados distintos: Gerado, Conferido, Assinado. Nova versão guarda histórico e não cria outra vistoria.

## Etapa 3 — Vistorias de entrada e saída por cômodo
- Reaproveita a Vistoria Inteligente, ligada ao aluguel e ao imóvel do contrato. Uma vistoria vigente por tipo e contrato; se existir, abre o rascunho.
- Entrada: libera após contrato salvo e conferido. Saída: só com entrada concluída e termo registrado (rascunho, transcrição pendente ou falha de PDF não liberam). Checado no servidor.
- Começa vazia; "Adicionar cômodo" cria pastinha nomeada, reordenável e renomeável. Na saída, pode sugerir os nomes dos cômodos da entrada, sem fotos, áudios ou textos.
- Em cada cômodo: fotos (câmera/anexo), áudio, descrição editável; áudio original guardado; voz indisponível → guarda gravação e permite reprocessar ou digitar. Nada inventado.
- Rascunho e arquivos salvos ao trocar de cômodo ou sem conexão; pendências de envio/transcrição visíveis.
- "Gerar termo": revisão breve e PDF pelo fluxo atual (imóvel, aluguel, data, tipo, cômodos em ordem). "Ver termo" na seção certa, arquivo privado. Saída ligada à entrada, nunca a sobrescreve, não encerra o aluguel. Drive mantido.

## Segurança
- Acesso de cônjuges, termos e downloads segue as permissões do aluguel por contrato e marca (incluindo bloqueios de meta_reviewer e atendimentos_viewer).
- CPF, RG, telefone e links de mídia fora de logs e de qualquer armazenamento público.

## Testes e entrega
- Testes automáticos: cônjuge no fiador certo, CPF inválido, caução/seguro sem cônjuge, checklist, conferência desfeita por edição, salvar sem duplicar, bloqueio entrada/saída.
- Teste pela tela com dados fictícios: 2 fiadores (esposa só em um), reordenar/reabrir e conferir Word; falha de upload; clique duplo; contrato externo; vistoria no celular com 2 cômodos, rede instável e erro de transcrição; saída bloqueada antes e liberada depois.
- Sem publicação. Relatório com testes, mudanças e pendências.

## Detalhes técnicos
- Migrações aditivas: `rental_contract_guarantor_spouses` (guarantor_link_id, tipo esposa/outro, nome, cpf, rg, profissao, telefone, ativo) com GRANT/RLS pelo acesso do contrato + políticas restritivas; `rental_contract_versions` (contract_id, version, checksum, document_id, generated/reviewed/signed_at, idempotency_key único); `inspections` ganha uso de `type='saida'` + `entry_inspection_id`; índice único parcial de vigente por (contrato, tipo); `rental_documents` aceita categoria `termo_vistoria_saida` e classificação explícita de termos legados.
- RPC/servidor: `confirm_generated_contract` (upload registrado → versão → conferência, idempotente); gate de saída no `inspection_create`; checklist puro em `src/lib/rentals/contract-checklist.ts` com hash dos dados usados para invalidar conferência.
- Componentes: `RentalFormModal` (cônjuge, rascunho), `RentalDocuments` (nova ordem/blocos), `RentalContractGenerator` (confirmar e salvar, retry), `RentalEntryInspection` → generalizado para entrada/saída; `creation-workspace`/vistoria para cômodos livres e sugestão na saída.
