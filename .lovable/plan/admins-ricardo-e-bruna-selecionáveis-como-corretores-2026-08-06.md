# Admins (Ricardo e Bruna) selecionáveis como corretores

## O que está acontecendo (verificado)

O banco já devolve os administradores na lista de corretores (`list_corretores` e `list_assignable_brokers` incluem perfis `admin`). O problema está no app: o hook que abastece a lista usada pelos formulários descarta quem não é exatamente `corretor`, então Ricardo, Bruna (e Leonardo) somem dos seletores. É por isso que em "Novo agenciamento" só aparecem Felipe, Geandre e Pablo.

Isso afeta todos os menus que usam essa mesma lista: Agenciamentos, Agenda (visitas e fotos), Vendas, Clientes/Atendimentos (campos auxiliares), Contratos e Configurações.

## Correção proposta

1. Passar a incluir os administradores na lista de corretores usada pelos formulários — eles ficam disponíveis para vínculo em todos os menus, com o nome normal.
2. Em Agenciamentos, o seletor de corretor responsável já é liberado para administração, então Ricardo e Bruna passam a conseguir criar cadastros no próprio nome (e continuam podendo atribuir a outros).
3. Manter as regras de imobiliária: só aparece quem atende a imobiliária escolhida (Ricardo e Bruna atendem Cordial e Morar, então aparecem sempre).

Observação: como o critério é "perfil administrador", o Leonardo também passa a aparecer na lista. Se preferir que ele fique de fora, é só avisar que eu restrinjo.

## Detalhes técnicos

- `src/hooks/useHydrateCorretores.ts`: remover o filtro `role === "corretor"` (manter apenas perfis `corretor` + `admin` que a RPC já retorna) e usar as imobiliárias reais em vez do valor fixo `"cordial"` quando disponível.
- `src/lib/equipe/equipe.functions.ts` (linha ~223): mesmo filtro — incluir admins para que os atendimentos/vendas vinculados a eles apareçam nos indicadores de equipe.
- Nenhuma migração de banco necessária: `list_corretores`, `list_assignable_brokers` e o gatilho de escopo já aceitam admins.
- Conferir os formulários que consomem a store (`AgenciamentoFormModal`, `AgendaFormModal`, `SaleForm`, `RentalFormModal`, `novo-compromisso`) para garantir que o nome apareça e que o valor selecionado persista.

## Validação

- Entrar como Ricardo e criar um agenciamento selecionando o próprio nome; repetir na edição.
- Conferir que Bruna também aparece e que a lista respeita a imobiliária escolhida.
- Checar Agenda, Vendas e Atendimentos: nomes de Ricardo/Bruna disponíveis nos campos de corretor.
