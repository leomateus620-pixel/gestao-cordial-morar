# Site próprio Cordial — implementação e homologação

Esta entrega adiciona uma superfície pública em `/site`, um canal de publicação independente e administração em `/site-administracao` dentro do layout autenticado. **Não é uma ativação em produção.** A migração não foi aplicada ao Supabase remoto; nenhum imóvel foi autorizado ou alterado em produção por esta tarefa.

O PR deve permanecer em **draft** enquanto os critérios operacionais e de aceitação abaixo estiverem pendentes. As fotos e os imóveis usados nas capturas posteriores vêm de uma amostra real do Gestão em banco local isolado; não comprovam migração integral.

## Leitura recomendada

- [Auditoria e reconciliação](audit.md): arquitetura, inventário completo e limites da comparação.
- [Matriz de paridade](parity.md): observado, implementado e validado são estados distintos.
- [Contrato, publicação e privacidade](contract.md).
- [Mídia, cache e retirada](media-cache.md).
- [Execução, ativação e autonomia](operations.md).
- [Validação](validation.md) e [evidências](evidence/).

## Execução local

Use Bun e o `bun.lock` do projeto. O `package-lock.json` que já estava sem rastreamento no início não faz parte desta entrega.

```sh
bun install --frozen-lockfile
bun run dev
bun run typecheck
bun run test
bun run test:site
bun run build
```

Sem as variáveis de servidor e a migração, a interface exibe indisponibilidade explícita. Não existe fallback para o site antigo nem catálogo fictício embutido no aplicativo.

Para a integração real em homologação, consulte `operations.md`. Os testes PostgreSQL criam seu próprio banco PGlite em memória. O auxiliar `scripts/cordial-site/local-qa.ts` só escuta `127.0.0.1`, exige `CORDIAL_LOCAL_QA=true`, e não é importado pelo aplicativo nem publicado no bundle.

## Pendências de aceite operacional

- Aplicar e testar a migração em um Supabase de homologação com a cadeia real de migrações, RLS, Storage e triggers de atendimento.
- Configurar segredos exclusivamente no servidor, proteção da homologação e identificação confiável do IP na hospedagem.
- Revisar autorização Cordial, disponibilidade, conteúdo público, unidades de área e galeria para **cada** imóvel elegível. Não existe aprovação em massa automática nesta entrega.
- Resolver divergências e revisar visualmente as mídias; os relatórios privados não devem ser publicados no GitHub.
- Aprovar e cadastrar contatos, textos institucionais, conteúdo de serviços e política de privacidade no módulo novo. Formulários ficam bloqueados sem política configurada.
- Validar infraestrutura definitiva, domínio/base path, redirecionamentos e limites de execução de imagens antes do corte.
- Completar navegadores/dispositivos, auditoria WCAG e desempenho em condições representativas. Capturas e testes locais não são métricas de campo.

Não foram feitos merge, deploy, alteração de DNS, importação comercial, disparo de filas do fornecedor ou envio de contatos reais.
