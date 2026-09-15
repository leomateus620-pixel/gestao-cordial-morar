# NFS-e nos Aluguéis — fechar a configuração e validar na prefeitura

## Situação

A emissão está **construída e ligada**. As senhas do webservice da prefeitura já foram cadastradas com segurança (`IPM_NFSE_SENHA_CORDIAL` e `IPM_NFSE_SENHA_MORAR`). O usuário passou os dados fiscais das duas empresas. Falta gravar a configuração e rodar o teste.

## Dados recebidos do usuário

| Campo | Cordial | Morar |
| --- | --- | --- |
| CNPJ | 42.767.687/0001-35 | 35.080.386/0001-73 |
| Inscrição municipal | igual ao CNPJ | igual ao CNPJ |
| Razão social | Cordial Imoveis LTDA | Bruna Weremchuk |
| Código NBS | 1.1001.21.00 | 1.1001.21.00 |
| Item da lista de serviço | 10.05 (administração de bens imóveis — confirmado) | 10.05 |
| Alíquota ISS | 3% | 3% |
| Simples Nacional | sim | sim |

Observação: com Simples Nacional marcado, os campos da reforma tributária (IBS/CBS) são omitidos do XML, conforme a exigência da prefeitura.

Também: de 50 contratos ativos, **2 locatários estão sem CPF/CNPJ** (Alice Dezotti Freitas, sala 704, e Caroline Fagundes — Fagundes Estética e Saúde Ltda, sala 502, ambos Morar/Clínica Cordis) — esses bloqueiam a emissão até o cadastro ser completado. Os outros 48 estão prontos.

## O que vou fazer

1. Preencher e salvar a configuração fiscal das duas marcas (CNPJ, inscrição municipal, razão social, NBS 1.1001.21.00, item 10.05, alíquota 3%, Simples Nacional ligado, modo teste ligado).
2. Rodar uma emissão em **modo teste** em um contrato de cada empresa. A prefeitura valida tudo e responde sem emitir nota de verdade.
3. Corrigir o que a prefeitura apontar (campos, item de serviço, dados do tomador).
4. Avisar quando estiver validado; só então o modo teste é desligado para emitir de verdade (pelo usuário, no card de Integrações).
5. Avisar quais são os 2 locatários sem CPF/CNPJ para o usuário completar no cadastro.

## Detalhes técnicos

- Configuração em `nfse_provider_settings` (uma linha por marca); histórico em `rental_nfse_emissions`.
- Valor da nota: sempre a **comissão mensal** (serviço de administração), nunca o aluguel cheio.
- Envio por `postNfse` (multipart para `WNERestServiceNFSe`, layout IPM 1.01, sem certificado digital).
- Senhas nos segredos `IPM_NFSE_SENHA_CORDIAL` / `IPM_NFSE_SENHA_MORAR` (já cadastradas; login = CNPJ da configuração).
- Fora de escopo desta etapa: cancelamento/substituição de nota e emissão em lote mensal.
