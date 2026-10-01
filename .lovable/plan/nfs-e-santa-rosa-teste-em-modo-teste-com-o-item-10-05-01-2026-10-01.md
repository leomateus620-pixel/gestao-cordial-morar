# NFS-e Santa Rosa — teste em modo teste com o item 10.05.01

## Situação
- O cadastro das duas marcas já está com o item `10.05.01`, que vai para a prefeitura como `100501`. O modo teste continua ligado.
- Falta rodar o teste: a última tentativa parou porque a tela de aluguéis não abriu no acesso automatizado.

## O que vou fazer
1. Entrar no sistema de teste com a sua conta e chamar o mesmo fluxo de emissão em modo teste que já existe. Não vou criar botões nem caminhos novos.
2. Fazer **uma tentativa por marca**, sempre em modo teste, com os mesmos contratos:
   - Cordial: contrato e971e17a (R$ 100, competência 08/2026)
   - Morar: contrato 9eb47d1a (R$ 85, competência 09/2026)
3. Se a tela de aluguéis não abrir de novo, chamar a mesma função de emissão direto pelo servidor, com a sua conta e `modoTeste=true`. É a mesma operação, só que sem passar pela tela.
4. Ler o histórico de emissões só para consulta e trazer o status e a mensagem de erro gravados de cada marca.
5. Se a prefeitura recusar de novo, paro e trago a mensagem. Não faço outra alteração.

## Fora do escopo
Mudanças no código, migrações, segredos, telas, alterações no cadastro, emissão real e publicação.
