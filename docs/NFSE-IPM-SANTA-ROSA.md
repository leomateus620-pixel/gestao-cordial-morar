# NFS-e Santa Rosa/RS — integração IPM REST (NTE 122/2025)

## Por que IPM REST e não ABRASF

Santa Rosa/RS opera no Atende.Net com **layout próprio IPM 1.01**, exposto em
`WNERestServiceNFSe`. O padrão ABRASF 2.04 (SOAP, `WNENotaFiscalEletronicaNfe`, NTE 123/2025)
existe em outros municípios IPM, exige WSDL e assinatura digital A1/A3 e **não** é o
caminho de Santa Rosa. Nada de ABRASF neste projeto.

- Endpoint: `https://santarosa.atende.net/?pg=rest&service=WNERestServiceNFSe`
- Fallback: `https://ws-santarosa.atende.net:7443/?pg=rest&service=WNERestServiceNFSe`
- Código TOM: **8847** · IBGE: **4317202**
- Autenticação: POST `multipart/form-data` com `login` (CNPJ), `senha` (webservice),
  `cidade` (8847) e o arquivo XML. Sem certificado digital.

## Regra de negócio

A NFS-e da imobiliária é sobre o **serviço de administração/intermediação** —
`rental_contracts.comissao_mensal` — e nunca sobre o valor cheio do aluguel
(`valor_mensal`, que é repasse ao proprietário).

- Tomador: locatário principal do contrato (`rental_tenants`).
- Prestador: CNPJ da marca do contrato (`cordial` ou `morar`).
- Local da prestação: Santa Rosa (TOM 8847).

## Liberar o webservice no Portal do Cidadão

1. Acesse o Portal do Cidadão de Santa Rosa com o certificado/senha da empresa.
2. Menu do ISS/NFS-e → **Webservice / Integração** → gere a senha de webservice.
3. Confirme a inscrição municipal ativa e o item da lista de serviço habilitado
   (sugestão LC 116 **10.05** — administração de bens; confirme no cadastro municipal).
4. Anote também o **código NBS** exigido pelo layout da reforma.

## Segredos (servidor, nunca no client)

| Segredo | Uso |
| --- | --- |
| `IPM_NFSE_SENHA_CORDIAL` | senha do webservice da Cordial |
| `IPM_NFSE_SENHA_MORAR` | senha do webservice da Morar |
| `IPM_NFSE_LOGIN_CORDIAL` / `IPM_NFSE_LOGIN_MORAR` | opcional; por padrão o login é o CNPJ da configuração |

Cadastre em **Configurações do projeto → Secrets**. A interface só informa
"senha configurada / faltando" — o valor nunca é exibido nem enviado ao navegador.
Sem a senha, o sistema monta o XML, grava a prévia no histórico e bloqueia o envio
com mensagem clara.

## Teste x produção

`nfse_provider_settings.modo_teste` (padrão `true`) gera `<nfse_teste>1</nfse_teste>`:
a prefeitura roda todas as validações e responde "NFS-e válida para emissão", sem
emitir. Para produção, desligue o modo teste na configuração ou desmarque o toggle
no diálogo de emissão.

## Reforma tributária (IBS/CBS)

O XML inclui `<IBSCBS>` dentro de `<nf>` (`cLocalidadeIncid` = 4317202) e o grupo
`<IBSCBS>` de nível superior com `cIndOp`, `CST` e `cClassTrib` — todos editáveis por
marca. Optantes do Simples Nacional: marque `simples_nacional`, e os grupos IBS/CBS
são omitidos conforme a NTE.

## Arquivos

- `src/lib/nfse/ipm/xml.ts` — builder do XML, sanitização e parser do retorno
- `src/lib/nfse/ipm/xml.test.ts` — testes unitários
- `src/lib/nfse/ipm/client.server.ts` — POST multipart
- `src/lib/nfse/nfse.functions.ts` — configuração, histórico e `emitRentalNfse`
- `src/hooks/useRentalNfse.ts`, `src/components/alugueis/RentalNfseSection.tsx` — UI
- Tabelas: `nfse_provider_settings`, `rental_nfse_emissions`

## Fora de escopo (próximas fatias)

Cancelamento/substituição de nota e emissão em lote mensal.
