# Organização da navegação lateral

## Objetivo e escopo

Reunir a rotina de locação em um bloco próprio e facilitar a leitura e o acesso aos módulos, usando a referência enviada em 20/10/2026. A alteração é de apresentação e interação de interface: não modifica URLs, definições de rotas, permissões, serviços ou banco de dados.

## Organização

| Bloco | Conteúdo |
| --- | --- |
| Operação | Painel, Cordial Bot, Agenda, Agenda de fotos, Agenciamentos, Imóveis, Seleções de imóveis |
| Comercial | Atendimentos, Vendas |
| Locação | Aluguéis, Vistoria inteligente, Novo contrato |
| Gestão | Corretores, Financeiro, Relatórios, Pesquisa de satisfação, Marketing, Documentos internos |
| Sistema | Configurações |

Cada perfil continua vendo apenas os módulos já autorizados. Blocos vazios não aparecem. Busca e Integrações continuam dentro de Configurações.

“Novo contrato” é uma ação de interface disponível a quem já pode acessar Aluguéis. Navega para `/alugueis` e solicita a abertura do `RentalFormModal` existente por estado transitório em memória. A página consome o pedido uma vez, limpa apenas a seleção local de edição/detalhe e abre o cadastro. Não adiciona parâmetros, rotas, persistência ou geração de documentos.

## Decisões visuais

- Barra expandida de 272 px; rail recolhido de 68 px e drawer adaptado à tela.
- Manrope 14 px nos itens, títulos curtos de 10 px e marca Sora preservada. Nomes podem quebrar linha em vez de serem cortados.
- Cards discretos com acento por grupo; Locação usa areia. O item ativo e o foco permanecem visíveis.
- Área mínima de 44 px nos itens. Tooltips descrevem os ícones no modo recolhido. Movimento reduzido respeitado.
- Destaque ativo aplicado ao próprio item: elimina a medição de uma pílula flutuante entre grupos.
- IDs próprios para os títulos de cada menu e os gradientes da marca, evitando colisão entre desktop e drawer.

## Plano executado e validação

1. Conferir o registro único de módulos, destinos existentes e acesso por perfil; definir os cinco grupos.
2. Aplicar a organização e os tokens compartilhados por desktop/drawer; adicionar somente o atalho para o formulário existente.
3. Validar no navegador, corrigir densidade e marca mobile, conferir tipos, lint dos arquivos de produção alterados, 12 testes focados e build de produção.

Prévia isolada: `npx vite --config tests/sidebar/vite.config.ts`, depois abrir `http://127.0.0.1:5178/tests/sidebar/preview.html`.

A prévia monta o `SidebarMenu` e o `RentalFormModal` reais com transporte isolado, histórico em memória e seletor de perfis. Ela não consulta dados reais e não grava contratos ou arquivos. Não altera o roteador de produção. A integração da tela autenticada completa deve ser conferida na homologação.

Evidências em `screenshots/`; comparação e limites detalhados no relatório `design-qa.md` da raiz.
