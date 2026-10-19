# Incidente 1409/3408: identidade, finalidade, publicação e Drive (recuperação segura)

Escopo: diagnóstico somente leitura primeiro; depois código, migrações aditivas e recuperação apenas dos registros com identidade comprovada, com auditoria e reversão. Sem NFS-e, regras de endereço, ordem de fotos, outros imóveis ou limpeza geral.

## Etapa 0 — Estado real (somente leitura)
- Ler AGENTS.md raiz e de `src/lib/imoveis/drive`, `src/lib/imobibrasil`.
- Comparar journal Drizzle × histórico aplicado no banco (0029–0031) e definições reais de `property_drive_claim_jobs`, gatilho de renomear, enum `property_publication_status` (com `conflict`).
- Conferir o que está no ar em cordialgestao.com × prévia.
- Nada é considerado resolvido só por existir no repositório.

## Etapa 1 — Matriz do incidente (somente leitura)
Para Casa 029558eb, AP e1613a15 e qualquer registro com 1409/3408, "Bali" ou "Timbaúva" (incluindo arquivados):
- UUID, códigos por destino, tipo, bairro, operação, agenciamento(s) e finalidade, corretor.
- Reservas de código (status, dono, quem reservou).
- Publicações Cordial/Morar: status, ID externo, última resposta, jobs e tentativas.
- Pastas e subpastas do Drive (IDs, parent, `appProperties`, registro no banco).
- Arquivos: Storage → registro → job → confirmado no Drive, por categoria.
- Snapshot salvo em tabela de auditoria (sem dados pessoais desnecessários).
- Se a identidade ficar ambígua: paro só aquela parte e peço confirmação objetiva.

## Etapa 2 — Causa raiz por problema
- Finalidade "venda" em imóvel de aluguel: rastrear cadastro → finalização → agenciamento (padrões, normalização locação/aluguel, estado antigo do formulário, gatilhos, reprocessos).
- Não aparece nos sites: diferenciar cadastro remoto, publicação ativa, mídia pendente e visibilidade pública; conflito de código; bloqueios legítimos (autorização, arquivamento).
- Drive: pasta adotada por nome, subpastas com parent de outro imóvel, verticais incompletas, vídeos ausentes (bytes no Storage? registro? envio iniciado?).

## Etapa 3 — Correções de código
- **Finalidade:** regra canônica única (operação → finalidade), aplicada em `finalizePropertyRegistration` e reconciliada quando a operação muda, sem trocar responsável, histórico, checklist ou bônus.
- **Publicação:** após sucesso, leitura de confirmação no provedor; antes de recriar após timeout, consultar o remoto; conflito de unicidade = terminal só daquela operação.
- **Drive — identidade:** validar dono da pasta principal e de cada subpasta (parent correto, registro e `appProperties`) sempre, não só ao adotar/renomear; subpasta incompatível → nova subpasta correta, sem apagar nada.
- **Drive — fila (`runDriveWorker`):**
  - pendência com tentativas esgotadas vira `failed` explícito, nunca `succeeded`;
  - continuação de lote (sem somar tentativa) separada de falha (soma tentativa, espera progressiva);
  - horizontais → verticais → vídeos sem ficar sem vez;
  - dono da execução (token do lease): worker antigo não conclui nem sobrescreve job reassumido;
  - antes de reenviar, procurar arquivo já existente no destino (nome + marca do imóvel/arquivo);
  - arquivo só "confirmado" com tamanho/ID compatíveis.
- **Checklist:** `applyDriveChecklist` atualiza vídeo mesmo com fotos já marcadas; reflete o estado atual dos arquivos, sem novas exigências.
- **Alerta sem progresso:** job sem avanço por X minutos aparece no painel do imóvel e no painel de operações.

## Etapa 4 — Painel do imóvel
Cinco linhas separadas: Publicação Cordial, Publicação Morar, Horizontais, Verticais, Vídeos. Cada uma com progresso real (contado dos arquivos), última atualização, erro em português e botão "Retomar" que preserva o que já foi concluído. Nunca 100% com pendências; "Atualizando cadastro" vira diagnóstico após o tempo limite.

## Etapa 5 — Migrações aditivas
- Coluna de dono da execução no job do Drive e nova versão de `property_drive_claim_jobs` / conclusão condicionada a ele.
- Tabela de auditoria da recuperação (antes/depois, quem, quando, como reverter).
- Índices únicos de códigos e de pasta somente se a consulta não achar duplicatas; senão, listar e parar.

## Etapa 6 — Testes (isolados)
Locação preservada no cadastro, agenciamento e envio aos dois sites; reserva de outro imóvel recusada; conflito remoto sem repetição; Casa/AP sem pasta compartilhada; pasta com nome certo e dono errado; subpasta com parent alheio; mais de 6 arquivos com vídeos; envio interrompido, lease vencido, workers concorrentes; tentativas esgotadas com pendência = falha; fotos antes do vídeo; publicação/sync repetidos sem duplicar; reconexão após falha de login sem perder histórico; regressões de endereço, códigos 1406/3405/1385, ordem de fotos e "envia antes de apagar". Rodar a bateria completa, typecheck e build.

## Etapa 7 — Recuperação em produção (só identidade comprovada)
- Suspender apenas os jobs que possam enviar ao destino errado.
- Corrigir finalidade do agenciamento confirmado como aluguel (sem recriar).
- Tirar 1409/3408 da Casa somente se a matriz confirmar que pertencem ao AP; a Casa fica sem código até você decidir (não invento código novo).
- Criar/selecionar a pasta correta de cada imóvel; copiar ou reenviar arquivos com origem comprovada; validar no destino antes de desvincular o antigo; nada é apagado.
- Arquivos sem origem comprovável ficam preservados e listados.
- Vídeos que nunca chegaram ao servidor: listar exatamente o que o corretor precisa reenviar.
- Republicar só esses imóveis, confirmando por leitura posterior e página pública.

## Entrega
Causa raiz por problema, matriz e evidências, código alterado, migrações aplicadas, recuperação feita (com contagem de mídias antes/depois por categoria), testes e pendências reais. Publicação do sistema após testes verdes, conforme autorizado.

## Riscos
- Banco recém-estabilizado: consultas e migrações pequenas.
- Reenvio pode duplicar arquivo no Drive: mitigado pela checagem prévia no destino.
- Casa sem código pode sair dos sites até receber código novo — decisão sua.
- Falhas externas (Drive, ImobiBrasil) continuam possíveis; o objetivo é detectar, isolar e mostrar, nunca travar em silêncio.
