# Recadastrar senhas de webservice e testar NFS-e

## Objetivo
Substituir as senhas de webservice da prefeitura de Santa Rosa das duas empresas (Cordial e Morar) e repetir a emissão em modo teste para validar o envio.

## Passos

1. **Formulário seguro de senhas**
   Abro o formulário protegido para você colar as duas senhas de webservice (uma para Cordial, uma para Morar). Os valores vão direto para o cofre de segredos — não passam pelo chat.
   - Cordial: senha do webservice gerada no Portal do Cidadão da empresa Cordial Imóveis LTDA (CNPJ 42.767.687/0001-35)
   - Morar: senha do webservice da empresa Bruna Weremchuk (CNPJ 35.080.386/0001-73)
   Lembrete: não é a senha de entrada no portal; é a senha específica de integração, no menu ISS/NFS-e → Webservice/Integração.

2. **Teste em modo teste, um contrato de cada empresa**
   Repito a emissão nos mesmos contratos usados antes (Cordial: comissão R$ 100; Morar: comissão R$ 85), com o modo teste ligado, para que nada seja lançado de verdade na prefeitura.

3. **Leitura do resultado**
   - Se a prefeitura aceitar: informo o número/protocolo retornado e a nota fica registrada no histórico do aluguel.
   - Se voltar erro: leio a mensagem exata da prefeitura e digo se é senha, cadastro fiscal (item de serviço, alíquota, inscrição municipal) ou dado do locatário.

4. **Correções apontadas pela prefeitura**
   Ajusto o que o retorno indicar e repito o teste até passar.

5. **Só depois de validado**
   Aviso você antes de desligar o modo teste; a emissão real fica travada até sua confirmação.

## Ainda pendente (fora deste teste)
Dois locatários da Morar sem CPF/CNPJ — Alice Dezotti Freitas (sala 704) e Caroline Fagundes / Fagundes Estética e Saúde Ltda (sala 502). Sem o documento, a nota deles não sai; posso incluir o cadastro depois que você me passar os números.

## Detalhes técnicos
- Segredos atualizados: `IPM_NFSE_SENHA_CORDIAL`, `IPM_NFSE_SENHA_MORAR` (login do webservice = CNPJ sem pontuação).
- Nenhuma mudança de código prevista; se o erro retornado indicar problema de layout, o ajuste sai em `src/lib/nfse/ipm/xml.ts` ou `client.server.ts`.
- Emissão disparada por `emitRentalNfse` com `modo_teste=true` em `nfse_provider_settings`.
