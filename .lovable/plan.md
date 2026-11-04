# Busca de pessoas em Aluguéis para a Bianca

## O que foi encontrado
- A pesquisa do topo que você usa (busca geral do sistema) é exclusiva do administrador, por regra já definida. A Bianca é secretária, então ela não tem essa busca geral — por isso o "José" não aparece para ela.
- Em Atendimentos isso já foi resolvido: a própria página assume a barra do topo e pesquisa ali dentro. A página Aluguéis ainda não tem essa busca própria, então para ela não há onde pesquisar nem resultado para clicar.
- O cadastro e os acessos dela ao menu Aluguéis estão corretos; o problema é a falta da busca na página, não permissão.

## O que será feito
1. Na página Aluguéis, a barra de pesquisa do topo passa a pesquisar dentro dos aluguéis (como em Atendimentos), para todos os perfis que acessam o menu — sem liberar a busca geral para a Bianca.
2. A pesquisa encontra por: nome do inquilino (inclusive co-locatário), nome do proprietário, fiador, endereço/título do imóvel e código; ignora acentos e maiúsculas.
3. Cada resultado mostra o contrato e, ao clicar, abre diretamente aquele contrato (o mesmo destino que você já usa).
4. A lista respeita o que cada pessoa já pode ver hoje; nada novo fica exposto.

## Verificação
- Entrar como a Bianca, pesquisar "José" em Aluguéis e confirmar que aparece e abre o contrato Esquina Guia Lopes.
- Confirmar que para você (admin) a busca geral continua igual fora de Aluguéis.
- Teste automático: secretária pesquisa em Aluguéis sem ganhar busca geral.

Sem publicar até sua autorização.

## Detalhes técnicos
- `src/routes/_app.alugueis.tsx`: `useRegisterPageSearch` com filtro client-side sobre os contratos já carregados (tenants, co-tenants, owner, guarantors, imóvel, código), normalizado com remoção de acentos.
- Clique navega para `/alugueis?id=<contrato>`.
- Novo teste em `src/lib/page-search.test.ts` (ou módulo puro de filtro) cobrindo correspondência por inquilino/proprietário.
