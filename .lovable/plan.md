# NFS-e: guardar e mostrar o documento OFICIAL de cada nota

## O que já está confirmado (só leitura, feito agora)
- As 2 notas de teste (729 e 717, de 01/10) têm `link_pdf` = página de autenticidade da prefeitura. Abrir essa página devolve **HTML** (634 KB, ISO-8859-1). É uma tela montada por script, sem link direto de PDF no HTML. O arquivo de impressão sai de uma chamada feita depois que a página carrega.
- **Código verificador:** a prefeitura devolveu `cod_verificador_autenticidade` (aparece em `response_raw`) e o leitor do retorno lê o campo certo. O campo fica vazio porque a gravação **zera de propósito** número, série, verificador, link e data nas notas de teste (`nfse.functions.ts` ~1124–1145). Em nota real, o valor é gravado. Não é perda do leitor.
- O "modelo genérico" é o comprovante `pdf-receipt.ts`, gerado quando o link não devolve um PDF. Hoje isso acontece sempre.

## Passo 0: descobrir como baixar o PDF oficial (só GET, sem emitir nem consultar nota real)
1. Abrir a página de autenticidade da nota de teste 729 num navegador automático. Gravar todas as chamadas de rede ao carregar a página e ao clicar em "Imprimir/Visualizar NFS-e".
2. Registrar: endereço da chamada que devolve o PDF, parâmetros (identificador, verificador, tipo), método, se pede sessão/cookie, captcha ou token da página, e se responde PDF para nota de teste.
3. Testar a mesma chamada fora do navegador (GET simples ou GET com cookie da sessão aberta antes) para ver se o servidor consegue repeti-la.
4. Escrever o achado numa seção nova do `docs/NFSE-IPM-SANTA-ROSA.md`, chamada "Documento oficial (PDF)".
5. **Apresentar o resultado ao Leonardo antes de seguir.** A partir daqui o caminho se divide:
   - **A, preferido:** a chamada é repetível, sem captcha. O servidor baixa o **arquivo original** da prefeitura e guarda o arquivo e o link de impressão.
   - **B:** é preciso captcha ou sessão de pessoa. Nesse caso não dá para baixar automaticamente. A cópia guardada vira o **DANFSe gerado (C)**, e a tela também mostra "Abrir na prefeitura" (link de autenticidade e impressão oficial), sempre visível.
   - **C, só se A não for possível:** gerar um DANFSe fiel a partir do **XML autorizado** da nota (retorno completo ou consulta). O modelo escolhido é o da **IPM/atende.net de Santa Rosa**, não o DANFSe nacional. Motivo: a nota é emitida no sistema municipal da IPM, e o leiaute da IPM é o que o tomador recebe e confere pelo mesmo link. O documento traz o QR/link e o código de autenticidade e a marca "Representação gerada pelo Gestão — confira a autenticidade no link". Para o XML autorizado: o retorno completo depende de configuração no portal (item do Leonardo). A outra opção, consultar a nota, só é usada em nota real e com autorização dele.

## O que muda na ficha do aluguel (por nota, em "Histórico por competência")
- Botões **Ver** (abre a cópia guardada com link temporário), **Baixar** e **Compartilhar**. No celular, Compartilhar usa o compartilhamento nativo com o arquivo. Sem esse recurso, aparecem "Copiar link" e "Enviar pelo WhatsApp", com o link oficial de autenticidade, nunca o link temporário.
- Nome do arquivo: `NFS-e <número> - <Cordial|Morar> - <MM-AAAA>.pdf`. É o padrão atual, a ser confirmado.
- Selo de origem: "Documento oficial da prefeitura" ou "Representação gerada (confira no link)".
- **Notas antigas:** o botão "Buscar PDF oficial" refaz só o arquivo, sem nova emissão. A rotina horária `nfse-pdf-retry` passa a substituir comprovantes genéricos pelo oficial quando for possível. A cópia anterior é mantida no histórico, nunca apagada.
- **Modo teste:** a prefeitura devolve número, link e verificador também em teste (visto nas notas 729/717), mas o sistema não grava esses dados de teste, e isso continua igual. A tela mostra a faixa **"NOTA DE TESTE — sem valor fiscal"**, sem Baixar e sem Compartilhar. Se o Passo 0 mostrar que a prefeitura gera PDF de teste, aparece só "Ver" com a mesma faixa.

## O que NÃO muda
- Emissão, consulta, reenvio, perfis, aprovações, snapshots, assinatura, regras fiscais e o modo teste ligado.
- Fotos, sincronização com os sites, endereço/complemento, reserva de códigos 1406/3405 e marca d'água 1385.
- Nenhum dado é alterado e nada é publicado.

## Segurança
- Só são aceitos endereços `https://santarosa.atende.net`. O redirecionamento é seguido manualmente e é recusado se trocar de host.
- Limite de 10 MB, com conferência da assinatura `%PDF` e do tipo de conteúdo. Tempo máximo de 20 s.
- Para abrir o arquivo, o link guardado é temporário. As permissões atuais de acesso são mantidas.

## Detalhes técnicos
- **Migração (só aditiva, se aprovada):**
  ```sql
  ALTER TABLE public.rental_nfse_emissions
    ADD COLUMN IF NOT EXISTS pdf_source text NULL
      CHECK (pdf_source IN ('oficial','gerado_xml','comprovante_legado')),
    ADD COLUMN IF NOT EXISTS link_impressao text NULL,
    ADD COLUMN IF NOT EXISTS xml_autorizado text NULL;
  COMMENT ON COLUMN public.rental_nfse_emissions.pdf_source IS 'Origem do PDF guardado';
  ```
  `pdf_document_id` passa a apontar para a versão atual. A versão anterior continua em `rental_contract_documents`.
- **Arquivos:**
  - `src/lib/nfse/official-pdf.ts`, novo e puro: monta o link de impressão a partir do identificador ou verificador, valida host e PDF.
  - `src/lib/nfse/pdf-archive.server.ts`: tenta o oficial, depois o DANFSe a partir do XML, e por último o comprovante legado (só quando não há XML). Guarda `pdf_source`.
  - `src/lib/nfse/danfse-ipm.ts`, novo, só no caminho C: leiaute IPM a partir do XML, com QR (biblioteca `qrcode`, roda no servidor da hospedagem).
  - `src/lib/nfse/ipm/response.ts`: lê o retorno completo (`<nfse>` e o XML) além do reduzido, sem mudar o que já é lido.
  - `nfse.functions.ts`: só leitura e visualização (`getNfsePdfUrl` com `download`, `pdfSource` na lista, `refreshOfficialPdf`). Nenhuma mudança no fluxo de emissão.
  - `src/routes/api/public/hooks/nfse-pdf-retry.ts`: também processa `pdf_source='comprovante_legado'`.
  - `useRentalNfse.ts` e `RentalNfseSection.tsx`: Ver, Baixar e Compartilhar, selo e faixa de teste.
  - `docs/NFSE-IPM-SANTA-ROSA.md`: achados do Passo 0.
- **Testes (dentro de `bun run test`):**
  - Extração de link e verificador do retorno reduzido e do completo, com fixtures.
  - Download oficial com dublê: PDF válido, HTML, host diferente, redirect para fora, tamanho acima do limite.
  - DANFSe a partir do XML de fixture: campos, QR, marca de representação.
  - Ordem de tentativa e não duplicar o arquivo.
  - Nome do arquivo, botões e regras de compartilhamento, modo teste.
  - Teste de regressão que confere que o que é gravado na emissão continua igual.
  - Suíte inteira e verificação de tipos.

## Depende do Leonardo
1. Aprovar este plano e, depois do Passo 0, escolher entre o caminho A e o C.
2. Se for C: habilitar "Utiliza Retorno Completo na Importação de XML" em Personalização do Prestador → aba Webservice, no atende.net, para Cordial e Morar.
3. Autorizar ou não a consulta de nota real, que hoje não existe, para recuperar o XML de notas antigas.
4. Autorizar a migração aditiva acima e a publicação no final.
