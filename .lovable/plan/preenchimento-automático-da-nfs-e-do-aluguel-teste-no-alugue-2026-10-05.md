# Preenchimento automático da NFS-e do aluguel + teste no aluguel do Rodrigo

## O que muda para todos os aluguéis
Ao abrir "Revisar serviço" na NFS-e de qualquer aluguel, a tela já vem preenchida:

- **Empresa emissora**: sempre a empresa do aluguel (Cordial ou Morar). Só aluguéis marcados como "ambas" continuam pedindo escolha.
- **Competência**: sempre o mês anterior ao atual, no horário de Brasília (hoje, outubro/2026 → setembro/2026). Continua editável.
- **Valor do serviço**: a comissão mensal do aluguel (neste caso R$ 170,00), não o valor do aluguel. Se o aluguel não tiver comissão cadastrada, o campo fica vazio com o aviso "Cadastre a comissão no aluguel".
- **Data do fato gerador**: último dia da competência (ex.: 30/09/2026).
- **Tomador**: o locatário do aluguel — nome e CPF/CNPJ (Rodrigo Elyel Costa Batista, 072.513.793-25).
- **Endereço fiscal do tomador**: tirado do endereço cadastrado do locatário quando possível (rua, número, bairro). O cadastro dele hoje é um texto livre ("Rua Canadá, n° 995 – Bairro Cidade Nova-Teresina/PI") e **não tem CEP nem código do município**; esses dois campos ficam destacados para preencher à mão.
- **Origem da revisão**: texto pronto, ex.: "Comissão de administração do aluguel — competência 09/2026 — contrato Avenida Santa Cruz 81", editável.

Tudo continua revisável antes de enviar; o preenchimento só acontece na primeira abertura e não sobrescreve o que a pessoa já digitou. Trocar a competência atualiza só a data do fato gerador e o texto da origem.

## Teste neste aluguel (Cordial, setembro/2026, R$ 170,00, Rodrigo)
Depois do ajuste, abro o aluguel, confiro que tudo veio preenchido e completo CEP e código do município do Rodrigo (Teresina/PI). Pontos que bloqueiam o envio ao modo teste da prefeitura:

1. **Perfil fiscal da Cordial ainda não aprovado.** A tela mostra "Perfil fiscal pendente de aprovação", e sem essa aprovação o sistema não envia nada, nem em teste. Isso precisa ser feito por você em Integrações → NFS-e, com o texto de aprovação do contador.
2. **CEP do Rodrigo**: preciso que você me passe esse dado ou confirme que posso usar o CEP geral de Teresina.
3. O envio continua **só em modo teste** (sem valor fiscal). Nenhuma nota real será emitida.

Com o perfil aprovado e o CEP definido, faço o envio de teste e mostro o resultado no histórico "Testes sem valor fiscal".

## Detalhes técnicos
- `RentalNfseSection.tsx`: estado inicial de `competencia` = mês anterior (America/Sao_Paulo); `emissor` já vem da marca do contrato; ao abrir a revisão, `draft` recebe `valor = contract.comissao_mensal`, `dataFatoGerador` = último dia da competência, `nome`/`documento` do locatário, endereço do locatário com parse simples (rua, nº, bairro) e `motivo` padrão. Preenche só campos vazios.
- Funções puras novas em `src/lib/nfse/rental-prefill.ts` (mês anterior, último dia, parse de endereço, montagem do rascunho) com testes unitários.
- Os dados do tomador/endereço já vêm no contrato carregado; se faltar, a consulta do contrato passa a trazer `cpf_cnpj` e `endereco` do locatário.
- Sem mudanças no banco, sem alterar o perfil fiscal, sem desligar modo teste, sem publicar.
