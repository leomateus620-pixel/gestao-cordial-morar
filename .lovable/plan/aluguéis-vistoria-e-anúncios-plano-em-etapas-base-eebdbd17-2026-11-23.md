# Aluguéis, vistoria e anúncios — plano em etapas (base eebdbd17)

O pedido tem seis frentes. Implementar tudo de uma vez é arriscado demais para o financeiro e para as contas de anúncio. Proposta: **três entregas**, cada uma com aprovação própria. Este plano detalha a **Entrega 1**; as outras ficam descritas e só começam depois da aprovação.

Nada do que segue liga emissão real de boletos, pagamento bancário, envio automático de mensagens, campanha ativa ou recarga.

## Entrega 1 — Repasse manual + checklist/contrato + vistoria de entrada

### 1A. Repasse ao proprietário (manual)
- Nova seção **Repasse ao proprietário** na ficha do contrato, por competência.
- Mostra: valor cobrado, valor recebido (informado pelo financeiro ou evidência do boleto), deduções linha a linha, valor previsto, valor aprovado e situação.
- Situações separadas: previsto → aguardando recebimento → em conferência → aprovado → registrado como pago (manual, com comprovante) → confirmado; e "divergente" em qualquer ponto.
- Cálculo em centavos no servidor, usando a regra do recibo como referência (aluguel + condomínio − honorários ± ajustes repassáveis; IPTU e seguro-fiança fora). Cada linha guarda origem, sinal, valor, destinatário e regra.
- Pagamento parcial, diferença, estorno ou dados bancários incompletos exigem decisão registrada com motivo.
- Dados bancários do proprietário em área restrita, sempre mascarados. Mudar o destino invalida a aprovação anterior. Cordial e Morar nunca se misturam. Repasse negativo ou acima do recebido é bloqueado.
- Comprovante privado anexado; histórico e demonstrativo por proprietário.
- Quem opera: admin e financeiro aprovam; secretária confere, dentro da marca dela. Outros perfis não veem.
- **Diagnóstico das contas:** por marca e ambiente, Cobrança e Contas a pagar em linhas separadas. "Contas a pagar" aparece como **não contratado/não verificado** até existir convênio e credencial próprios.
- **Título Morar incerto no sandbox:** resolver só pela conferência que já existe; nenhum título novo enquanto não houver resposta.

### 1B. Novo aluguel → checklist → gerar contrato
- Em Novo contrato: "Preencher checklist" e "Gerar contrato" como caminho principal; anexar contrato externo continua disponível.
- Checklist em partes (imóvel, financeiro, prazo/reajuste, garantia, responsabilidades, entrega, revisão), com pendência por campo e campos condicionais por garantia. Rascunho salvo no servidor, retomável.
- Modelos de contrato versionados por marca/tipo, **somente com textos que a imobiliária enviar e aprovar**. Sem modelo aprovado, o botão "Gerar contrato" fica indisponível com aviso.
- Prévia completa antes de confirmar. A geração guarda versão do modelo, dados usados, revisão, autor e PDF privado. Correção = nova versão, a anterior fica preservada.
- Gerado, enviado, assinado e ativo são situações separadas. Sem assinatura eletrônica nesta entrega.

### 1C. Vistoria de entrada livre
- Depois da primeira versão válida do contrato, aparece **Iniciar vistoria de entrada**. Uma vistoria de entrada por contrato; se já existir, abre a mesma.
- Começa vazia: "Adicionar cômodo ou item", nome, voz ou texto, fotos. Item solto (ex.: chaves) ou dentro de um cômodo. Editar e reordenar à vontade.
- Usa a Vistoria Inteligente que já existe: mídia privada, gravação salva antes de transcrever, sugestão editável que não muda nada sozinha, termo em PDF versionado pelo servidor.
- A ficha do aluguel mostra a situação: rascunho, mídia pendente, transcrição pendente, em revisão, termo concluído.

## Entrega 2 — Mensagens por etapa (só "Revisar e enviar")
Fila com bloqueio de repetição por evento + destinatário + modelo + canal, prévia com destinatário de teste, tentativas e status. Antes de começar, preciso saber o canal e o número oficial.

## Entrega 3 — Marketing Morar
Escolher marca e plataforma antes de conectar, confirmar conta/moeda/fuso, sem usar a Cordial como reserva. Registrar separadamente o que foi comprovado: leitura, edição, criação, status e faturamento. Fluxo rascunho → validar → criar pausada → conferir → ativar com aprovação. Faturamento só com o link oficial "Abrir faturamento", sem recarga simulada. O Google fica só em leitura até o acesso de escrita ser comprovado.

## Detalhes técnicos (Entrega 1)
- Migrações aditivas novas (0103+), cada uma com grants, RLS, política restritiva `meta_reviewer_block`/`atendimentos_viewer`, e gravação só pelo servidor:
  - `rental_obligations` (contrato × competência × ocorrência, única) — chave comum de cobrança, recibo e repasse.
  - `owner_payout_destinations` (versionado, dados mascarados para leitura; documento completo só no servidor).
  - `rental_payouts` + `rental_payout_lines` + `rental_payout_events` (transições com compare-and-set, idempotência por obrigação + destino + versão).
  - `rental_contract_checklists`, `rental_contract_templates` (versão aprovada, imutável), `rental_contract_versions` (snapshot + PDF + hash).
  - `inspections.rental_contract_id` + `kind` (anulável) e índice único parcial para a vistoria de entrada vigente.
- Regras puras e testáveis: `src/lib/rentals/payout-model.ts`, `contract-checklist.ts`, `contract-render.ts`; servidor em `*.functions.ts` com `requireSupabaseAuth` e checagem de perfil + marca como em `authorizeContract`.
- Boleto não dá baixa no aluguel; o repasse só lê a evidência.
- Telas: `RentalPayoutSection.tsx`, `RentalChecklistWizard.tsx`, `RentalContractVersions.tsx`, botão de vistoria em `RentalExpandedDetails.tsx`.
- Testes: cálculo com comissão/desconto/encargo/ajuste, parcial, duplicado, estorno, troca de destino, negativo, marca cruzada; checklist incompleto e falha de PDF sem duplicar; nova revisão mantém a mesma vistoria; vistoria com 3 entradas (mídia na entrada certa). Rodar build, typecheck, `test:boleto`, `test:receipts` e a suíte completa. O teste em Safari/iPhone com rede instável fica como pendência manual.
- AGENTS.md: regras novas para obrigação/repasse e modelos de contrato.

## Riscos
- As regras de repasse dependem da validação da Bianca e do financeiro; até lá, os valores aparecem como "previsão — não validada".
- Sem modelo de contrato aprovado, a 1B entrega só o checklist e a estrutura.
- A Entrega 1 é grande; será feita em commits separados (1A, 1B, 1C), sem publicar.

## Perguntas
1. Comprovante manual: só admin/financeiro aprovam o repasse, ou a secretária também?
2. Repasse parcial é permitido, ou só repasse integral após recebimento total?
3. Podem me enviar o(s) modelo(s) de contrato aprovados (Cordial/Morar, residencial/comercial)?
4. Contrato antigo anexado e conferido também libera a vistoria de entrada?
5. "Ambas" (plano anterior pulado): o repasse de contrato "ambas" sai pela conta de qual marca?
