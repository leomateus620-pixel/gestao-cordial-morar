# Página pública de Termos de Serviço

Endereço: https://cordialgestao.com/termos-de-servico (aberta, sem login, legível pelo Facebook).

## Conteúdo (só fatos reais, sem inventar)
- Quem presta: Cordial Imoveis LTDA, CNPJ 42.767.687/0001-35, contato atendimento@cordialgestao.com.
- O que é o Gestão Cordial: sistema interno de gestão imobiliária da Cordial e Morar (imóveis, atendimentos, anúncios).
- Uso de Facebook/Instagram: recebimento de contatos de formulários de anúncio e leitura de dados de campanhas da própria empresa.
- Responsabilidades de quem usa: informações verdadeiras, uso permitido.
- Dados pessoais: remete à Política de Privacidade e à página de Exclusão de dados.
- Alterações dos termos, data de atualização e foro/legislação brasileira em termos gerais (sem cláusulas inventadas).

## Etapas
1. Criar a página no mesmo visual das páginas de Privacidade e Exclusão.
2. Adicionar link para os Termos no rodapé dessas duas páginas.
3. Publicar e conferir no ar: abre por HTTPS sem login (código 200) e o texto aparece.
4. Entregar o endereço para colar no campo "URL dos Termos de Serviço" no painel da Meta.

## Detalhes técnicos
- Nova rota `src/routes/termos-de-servico.tsx` usando `LegalPage`, com head() próprio.
- Sem banco, sem mudanças em integrações.
