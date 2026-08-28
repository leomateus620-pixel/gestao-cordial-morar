# Checkup do menu Imóveis com os perfis Corretor e Secretária

Objetivo: rodar o fluxo completo do menu Imóveis logado como corretor e como secretária, encontrar travas de permissão/bugs e corrigir o que aparecer, deixando a experiência igual à do admin (exceto o que é realmente administrativo).

## O que já verifiquei antes do teste

- As regras de banco de `properties` já liberam cadastrar, editar e excluir para admin, secretária e corretor.
- Fotos e vídeos: as tabelas e os buckets aceitam qualquer usuário autenticado — sem trava aparente.
- Publicação: usuários não-admin só podem publicar nas imobiliárias às quais estão vinculados. Hoje todos os 3 corretores e a secretária estão vinculados a Cordial e Morar, então o caminho está liberado.
- As telas de Imóveis (lista, ficha, editar, novo) já exigem apenas o módulo "imoveis", que foi liberado para os dois perfis.
- Pontos que continuam restritos a admin por definição: configurar a pasta raiz do Google Drive, painel de saúde das APIs e o painel de importação/sincronização em massa.

## Testes que vou executar de verdade

Para cada perfil (um corretor e a secretária), com uma sessão real do usuário:

1. Abrir o menu Imóveis, listar, filtrar e abrir a ficha de um imóvel existente.
2. Criar um imóvel de teste pelo fluxo completo (Etapas 1 a 8), incluindo reserva de código Cordial/Morar.
3. Etapa 6: subir uma foto real e acompanhar a marca-d'água até o status "pronta"; testar remover e reordenar.
4. Etapa 7: registrar o agenciamento vinculado ao imóvel.
5. Etapa 8: verificar o estado do Google Drive e disparar a sincronização.
6. Clicar em "Publicar imóvel" e conferir se a fila de publicação aceita o pedido dos dois perfis.
7. Editar o imóvel salvo e conferir que a alteração persiste e reenfileira a atualização.
8. Excluir o imóvel de teste pela ficha, garantindo que nada de teste fique no catálogo nem nos sites.
9. Conferir que nenhum menu proibido apareceu para eles durante o percurso.

Cada passo registra o erro exato (mensagem, status HTTP, regra de banco envolvida) quando falhar.

## Correções

Depois dos testes, corrijo o que aparecer, provavelmente em três frentes:

- Regras de banco faltantes para gravar em tabelas de apoio (fila de fotos, fila do Drive, publicações) quando o caminho do usuário passar por elas.
- Mensagens e bloqueios de tela que hoje assumem admin sem necessidade (por exemplo, a Etapa 8 dizer que não há pasta configurada em vez de mostrar o estado real da sincronização).
- Ajustes de vínculo por imobiliária, caso algum corretor futuro fique sem carteira e seja barrado ao publicar — nesse caso a mensagem precisa explicar o motivo em vez de falhar seco.

## Detalhes técnicos

- Sessões de teste são geradas pelo lado servidor para os usuários reais dos perfis, sem pedir senha a ninguém, e usadas em um navegador automatizado contra o app local.
- Os imóveis criados no teste são apagados ao final; se algum chegar a ser publicado, a remoção passa pela mesma fila de exclusão que os sites confirmam.
- Arquivos prováveis de mudança: `src/lib/imoveis/publish.functions.ts`, `src/lib/imoveis/drive/property-drive.functions.ts`, componentes de Etapa 6/8 em `src/components/imoveis/`, e uma migração de políticas apenas para as tabelas de apoio de imóveis.
- Fecho com verificação de tipos e um novo passe do fluxo nos dois perfis para confirmar as correções.
