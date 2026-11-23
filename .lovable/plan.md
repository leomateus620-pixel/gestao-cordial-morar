# Contrato de aluguel: check-list real e cláusula por seguradora

## O que existe hoje

- "Check-list aluguel" é só uma pasta de anexos no contrato: não há itens, nem quem marcou, nem data.
- As garantias do contrato (fiança, caução, seguro-fiança) são escolhidas na hora de cadastrar, mas não puxam nenhum texto.
- Cada seguradora tem uma cláusula obrigatória própria. Hoje esse texto é digitado à mão, com risco de sair errado ou faltar.
- Modelos da Cordial recebidos e lidos: fiança (imóvel comercial), caução (residencial) e seguro-fiança (residencial, cláusula da Pottencial no modelo; o contrato real anexado tem apólice da S8 Garante).
- Vistoria de entrada já está pronta: o contrato anexado precisa ser marcado como conferido para liberar a vistoria.

## O que construir

### Etapa A — cadastro de seguradoras e cláusulas
- Tela em Configurações (admin) para cadastrar seguradora: nome, marca (Cordial, Morar ou ambas), situação (ativa ou fora), e a cláusula obrigatória completa.
- Sem cláusula cadastrada, a seguradora não aparece na hora do contrato.
- Cláusula editável a qualquer momento, com histórico de quem mudou e quando.

### Etapa B — check-list por marca e tipo de garantia
- Itens de check-list definidos por marca e por tipo de garantia (fiança, caução, seguro-fiança, sem garantia).
- Cada item tem: nome, obrigatório ou não, ordem.
- No contrato: marcar item como feito registra quem fez e quando; itens obrigatórios pendentes ficam visíveis no topo do contrato.
- Itens sugeridos a partir dos modelos: qualificação das partes, vistoria de entrada anexada e conferida, apólice ou caução comprovada, ficha de capa, dados de locação, testemunhas, assinatura.

### Etapa C — gerar contrato com a cláusula da seguradora
- Na tela do contrato: escolher modelo (marca + tipo de garantia) e, se a garantia for seguro-fiança, escolher a seguradora ativa.
- O sistema monta o contrato a partir do modelo aprovado e insere a cláusula daquela seguradora no lugar certo (no lugar da cláusula da garantia).
- O contrato gerado fica anexado como documento do contrato, com versão e data, e entra na lista de conferidos.
- Formato: arquivo editável (DOCX) gerado a partir do modelo, mais uma via em PDF pronta para assinatura.

### Etapa D — vistoria de entrada (concluída, falta o vínculo)
- Botão "Iniciar vistoria de entrada" já aparece no contrato e só libera depois de o contrato anexado estar marcado como conferido.
- Teste feito e desfeito: marcar como conferido liberou o botão; desmarcar voltou a bloquear.
- Impedimento encontrado: os 70 contratos apontam para a tabela de imóveis de aluguel, não para o catálogo de imóveis. A vistoria é registrada sobre um imóvel do catálogo, então hoje nenhum contrato consegue iniciar a vistoria. Só 18 dos 72 imóveis de aluguel batem com um endereço do catálogo.
- Decisão pendente (Leonardo): escolher o imóvel do catálogo na hora da vistoria, criar um vínculo fixo no contrato, ou fazer a vistoria usar o imóvel do próprio contrato.

## Banco de dados (uma migração aditiva, 0105)

```text
rental_insurers            seguradora: nome, marca, cláusula, ativa
rental_insurer_edits       histórico de quem mudou a cláusula e quando
rental_checklist_items     item: marca, tipo de garantia, nome, obrigatório, ordem
rental_checklist_checks    marcação: contrato, item, feito por, quando
rental_contract_templates  modelo: marca, tipo de garantia, arquivo, versão
rental_contracts           + insurer_id (qual seguradora foi contratada)
```

- Nada é apagado ou renomeado: só entram tabelas e colunas novas.
- Acesso: todos os perfis que veem o contrato podem ver o check-list; marcar item exige acesso ao contrato; cadastrar seguradora e modelo é só do administrador.
- A cláusula da seguradora só entra no contrato gerado, nunca em lugar de outro texto do contrato.

## Regras que valem para tudo

- Nenhum pagamento, nenhuma cobrança, nenhum envio automático.
- Nenhuma publicação nos sites.
- NFS-e e boletos não são tocados.
- Contratos já existentes não mudam de conteúdo: a cláusula nova só aparece em contrato gerado depois.
- Migração aditiva, sem apagar nada.

## O que depende de você

1. Quais seguradoras estão ativas hoje e a cláusula obrigatória de cada uma (ou autorizar começar com a Pottencial do modelo).
2. Autorização para marcar como conferido o contrato anexado de um contrato real, só para testar a liberação da vistoria.
3. Se o contrato gerado deve sair editável (DOCX), em PDF, ou os dois.
