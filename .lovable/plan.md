# Liberar os bots Cordial e Morar: validar o IP confiável e publicar

## Objetivo
Comprovar, separadamente em cordialimoveis.com e imobiliariamorarimoveis.com.br, que o servidor recebe o IP real do visitante e ignora cabeçalhos forjados. Depois configurar `PUBLIC_BOT_TRUSTED_IP_HEADER` e `PUBLIC_BOT_INGRESS_VERIFIED` e publicar, para liberar os dois bots.

## Etapas
1. **Sonda temporária de diagnóstico (código novo e isolado)**
   - Criar o endereço público `/api/public/ingress-probe`, protegido por um segredo descartável `INGRESS_PROBE_TOKEN` enviado no cabeçalho. Sem o segredo, ele responde 404.
   - A sonda devolve só um HMAC de cada cabeçalho candidato (`cf-connecting-ip`, `true-client-ip`, `x-real-ip`, o primeiro e o último valor de `x-forwarded-for`, `x-forwarded-for` inteiro), mais o host e a marca. Nunca devolve IP bruto.
   - Não toca nos bots, no banco, nos limites de acesso nem na ImobiBrasil.
2. **Publicar a sonda** (sem mudar mais nada) e aguardar que fique no ar nos dois domínios.
3. **Teste por domínio** (Cordial e Morar, separadamente, com o endereço com e sem www):
   - Descobrir o IP de saída do ambiente de teste e calcular o HMAC esperado localmente.
   - Requisição limpa: anotar quais cabeçalhos trazem o HMAC do IP real.
   - Requisições com `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip` e `true-client-ip` forjados com IPs de teste (TEST-NET): o cabeçalho certo deve continuar com o IP real.
   - Repetir 3 vezes para descartar cache e IP de saída instável.
   - Para a Morar, identificar qual cabeçalho a camada extra de proxy preserva ou sobrescreve.
4. **Decisão**
   - Aprovado só se existir **um único cabeçalho** que, nos dois domínios, traga o IP real e não aceite valores forjados.
   - Se os domínios divergirem, ou nenhum cabeçalho for confiável, paro e mostro o resultado, sem configurar nada.
5. **Configuração e publicação final** (somente se aprovado)
   - Gravar `PUBLIC_BOT_TRUSTED_IP_HEADER` com o cabeçalho aprovado e `PUBLIC_BOT_INGRESS_VERIFIED=true`.
   - Remover a sonda e o segredo `INGRESS_PROBE_TOKEN`, e publicar.
   - Abrir o bot nos dois sites e confirmar que ele está disponível. Isso consome no máximo 1 conversa curta por marca, ou seja, chamadas pagas de IA.

## O que não muda
Não mudam a NFS-e, os boletos, a ImobiBrasil, os imóveis, as fotos, os dados de clientes nem o assistente interno. Não há migração no banco.

## Limite da evidência
O teste vem de um único IP de saída. Ele prova o comportamento da hospedagem e do proxy da Morar para esse caminho, não para toda rede possível.
