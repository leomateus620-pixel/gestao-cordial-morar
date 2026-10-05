# NFS-e de Aluguéis — Santa Rosa / IPM

## Situação desta entrega

Implementação integrada aos server functions TanStack e à ficha existente de Aluguéis. A referência `d03c42b4bccfacca4b21bd87c1ef6441b5dc633c` foi obtida do GitHub e comparada: os arquivos fiscais afetados eram iguais aos da revisão local `a75fa6bb`. Não há novas rotas, Edge Functions, RPCs expostas ou emissor paralelo.

Em 05/10/2026 o solicitante confirmou que **ainda não existe perfil fiscal aprovado**. O código não transforma a configuração herdada em aprovação. Nenhuma transmissão municipal, alteração de segurança remota, migration real, cancelamento ou substituição foi executada nesta entrega.

## Contrato IPM conferido

Referências oficiais consultadas: [NTE 35/2021, versão 2.9](https://wiki.ipm.com.br/?QR=&download=202135) e [NTE 122/2025, versão 1.7](https://wiki.ipm.com.br/?download=2025122).

O transporte utiliza REST síncrono, multipart e Basic Auth. O único destino permitido é `https://santarosa.atende.net/?pg=rest&service=WNERestServiceNFSe`. Redirecionamentos são recusados. Não existe fallback para host/porta alternativos. A resposta é limitada a 1 MiB; o timeout é limitado pelo servidor.

A consulta documentada usa autenticidade, ou número, série e cadastro econômico. Não existe consulta inventada por protocolo/RPS. Um reenvio do XML original pode concluir a emissão e exige ação explícita. HTTP 200 isolado não confirma emissão. Os retornos completo e reduzido são interpretados com validação de identidade e situação.

A associação antiga de 10.05 a administração foi removida. Códigos de serviço, NBS, alíquota, indicador de operação e classificações dependem do enquadramento aprovado. Não se troca código para fazer o XML passar. Data do fato gerador é civil; grupos de imóvel, referências e IBS/CBS obedecem aos campos condicionais do layout escolhido.

A leitura dos manuais não substitui habilitação do contribuinte nem homologação aplicável a Santa Rosa.

## Perfil e operação fiscal

Cada empresa possui um perfil ativo versionado, explicitando administração ou intermediação, papel do tomador, origem do valor, elegibilidade, descrição, município da prestação, regime, layout e percentuais de retenção. Aprovação e autorização de produção registram ator, horário e versão no banco. O financeiro mantém seu acesso existente aos campos comuns; aprovação de perfil e alteração de ambiente exigem administração.

Aluguel bruto, comissão da imobiliária e repasse são grandezas distintas. A operação não declara aluguel bruto como repasse nem adota comissão/locatário atuais para meses anteriores. O valor faturado, o tomador e seu endereço fiscal precisam de revisão explícita. O endereço do imóvel só compõe o grupo de imóvel quando aplicável; nunca substitui automaticamente o endereço do tomador.

A marca `ambas` exige escolher Cordial ou Morar. Valores desconhecidos são rejeitados. CNPJ alfanumérico e zeros são preservados na configuração, validação, XML e autenticação. A credencial deve corresponder ao prestador.

A configuração apresenta quatro evidências separadas: credencial cadastrada, configuração aprovada/completa, versão validada em teste e produção autorizada. Produção depende também de teste persistido da mesma versão. Qualquer alteração material invalida aprovações e retorna ao teste. Troca de senha preserva a identidade; troca de prestador/perfil bloqueia recuperação com XML antigo.

## Competência e origem histórica

`proximo_vencimento` não é a competência fiscal. A baixa usa vencimento esperado e atualização condicional para impedir repetição de uma mesma ocorrência. Um trigger privado captura os dados anteriores (vencimento, comissão, aluguel bruto e tomador) na mesma transação que avança a cobrança.

A referência de pagamento não presume competência nem fato gerador: esses campos continuam pendentes. Na emissão assistida, uma referência fiscal revisada registra competência, data civil, valor, tomador, origem e motivo, vinculando a ocorrência original quando houver. Se a origem aprovada for a comissão preservada, divergências são bloqueadas. Histórico inexistente não é reconstruído a partir do vencimento já avançado.

A preparação dessa referência é independente e pode permanecer sem emissão. A atomicidade garantida é a do estado fiscal com seu evento, e a da baixa com sua referência; não se alega uma transação distribuída com a prefeitura.

## Prévia, identificação e recuperação

A prévia usa POST para não colocar dados pessoais em URLs. O servidor valida e assina um snapshot canônico, com validade de 15 minutos e vínculo ao usuário. O HMAC utiliza uma credencial disponível exclusivamente no servidor, que nunca faz parte do snapshot. A assinatura abrange empresa, competência, ambiente, configuração, perfil, contrato, referência, revisão e payload. O envio reconstrói os dados e verifica a assinatura. Alterações materiais invalidam a aprovação; a UI também limpa a confirmação local.

Antes do HTTP, a linha `processando`, o identificador, o snapshot e a tentativa são persistidos. O trigger grava o evento na mesma transação; falha no evento reverte o estado. Índices impedem transmissão simultânea do mesmo CNPJ, inclusive por marcas diferentes. A incerteza mantém o bloqueio. Registros legados pendentes sem identidade comprovada exigem conferência, sem reconstrução pelo CNPJ atual.

Cada resposta atualiza somente a tentativa reivindicada. Respostas tardias são guardadas como evidência sem alegar uma transição; a reclassificação só considera a tentativa vigente, HTTP original, resposta completa, transporte e versão do parser. Iniciar recuperação limpa a resposta operacional anterior, preservada nos eventos. Recusa de consulta não prova ausência de emissão.

Consulta não reenvia emissão. Reenvio explícito mantém XML, prestador, configuração, identificador e conteúdo originais; para produção exige confirmação. A expiração de `processando` encaminha para `incerto` quando o servidor é consultado, sem liberar uma nova nota. Fechar a ficha não cancela o HTTP iniciado nem apaga a intenção. Encerramento do processo pode interromper a execução; a referência persistida permite recuperação assistida ao reabrir.

Correção material usa revisão explícita vinculada a uma tentativa comprovadamente recusada ou resolvida como `nao_emitida`. O administrador aprova uma nova prévia e uma identidade própria determinística, em cadeia única. Tentativa incerta, emitida ou cancelada não pode originar esse fluxo. Uma revisão repetida não cria outro fato; recuperação conserva a identidade da revisão. Legados sem prova suficiente exigem conferência interna.

Não há cancelamento ou substituição automáticos. Uma nota cancelada informada no retorno permanece distinta de recusa e de resolução como não emitida.

## Persistência proposta e implantação

Migration: `supabase/migrations/20261005090000_rental_nfse_integrity.sql` — **não aplicada remotamente**.

Inclui referências imutáveis, versões/aprovações da configuração, identidade do prestador, snapshot/hash, tentativa, contexto de transporte, auditoria atômica e proteções de concorrência. FKs passam a `RESTRICT`; exclusão física de contratos com histórico ou referências fica bloqueada. O fluxo existente de encerramento permanece disponível. Não apaga nem reclassifica dados antigos por inferência.

XML, respostas e snapshots deixam de ter SELECT direto para usuários do navegador. A projeção operacional mantém RLS; diagnóstico e eventos são restritos ao servidor. Erros técnicos não entram no DTO de Aluguéis. Falhas de persistência apresentam referência de atendimento e conservam a necessidade de conferência.

Retenção: evidências ficam preservadas, sem rotina de expurgo. Prazo legal, descarte e acesso extraordinário dependem de política aprovada; nenhum prazo foi inferido.

A implantação exige revisão e autorização da migration, backup e aplicação em ambiente autorizado, seguida de implantação coordenada do código. Antes da migration, o novo caminho de baixa falha de modo seguro para não avançar vencimento sem referência. Essa dependência precisa constar da janela de implantação. O rollback operacional não deve remover evidências ou restaurar permissões de diagnóstico; prefira correção progressiva.

## Automação e pendências de ativação

A política implementada permanece `assistida`. Não foi adicionado disparo fiscal a “Marcar pago”, polling executor, execução solta após resposta nem cron fictício. Os hooks existentes tratam propriedades, mídia, lembretes e sincronizações; não constituem executor fiscal durável compatível.

Para automatizar será necessário: aprovação contábil por empresa/operação, critério de elegibilidade, limites e autorização expressa; habilitação municipal e homologação autorizada; migration e verificação de RLS/transações no ambiente de destino; mecanismo durável aprovado para reivindicar e retomar intenções, com autenticação interna existente e sem reenvio automático de notas reais. Ampliar um executor existente exige avaliação de contrato e escopo próprios.

## Verificação reproduzível

- `npm run test:nfse`: regras, documentos alfanuméricos, XML, multipart/redirect/timeout/503, parser, assinatura, handlers, estado da UI e PostgreSQL local (PGlite).
- `npm run typecheck`: tipos do aplicativo completo.
- `npm run build`: cliente e servidor; o build existente emite avisos de dependências/inputValidator e WASM sem abortar.
- Lint focado nos arquivos alterados; a suíte geral é reportada separadamente quando houver falhas anteriores.

Os handlers são exercitados com DB e transporte substituídos; os triggers/constraints/permissões são executados em PostgreSQL local por PGlite. Nenhum desses testes equivale a homologação municipal, implantação Supabase ou teste em produção. Fixtures são sintéticas e não contêm credenciais reais.

### Evidências locais finais desta revisão

Em 05/10/2026: 42 testes fiscais na linha de base; 125 testes na suíte fiscal ampliada; suíte principal final com 484 testes aprovados, sem falhas. Typecheck do aplicativo e build de cliente/servidor concluídos. ESLint em 33 arquivos TypeScript alterados: zero erros e zero avisos. `git diff --check` sem erros.

A suíte principal foi executada pelo mesmo tsx/test runner via Node (`node --import tsx --test` com a lista de arquivos do script), sem depender do wrapper bunx. Os novos casos também estão incluídos em `npm test`, além de `npm run test:nfse`.

A inspeção visual local usou os componentes reais e o CSS do aplicativo, com hooks substituídos por fixtures sanitizadas, sem acesso à prefeitura ou banco. Foram conferidos desktop e viewport móvel, escolha de emissor/competência, falha de histórico com retry e separação de testes. A inspeção de DOM móvel não encontrou campos sem label ou overflow horizontal. Não equivale a teste em aparelho físico, leitor de tela ou sessão autenticada de produção. As capturas locais anteriores ao último checkbox administrativo permanecem em `.local/nfse-qa/` (não versionadas).

A implantação e a homologação municipal permanecem não verificadas. Não foi emitida nenhuma nota fiscal real.
