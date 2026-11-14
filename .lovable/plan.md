# Verificação (somente leitura): IA dos destaques semanais

## Resultado
- Chave da IA: configurada no projeto (gerenciada) e presente no ambiente do servidor. Valor não exibido.
- Modelo usado por `editPhoto`: `openai/gpt-image-2.5-sunburst` (definido em `src/lib/cordial-site/showcase.ts`).
- Disponibilidade: o modelo aparece na lista oficial de modelos do serviço de IA (consulta gratuita, resposta 200). Também existe uma versão mais nova, `openai/gpt-image-2.6-sunburst`, se quiser avaliar depois.
- Nenhuma imagem gerada, nenhuma chamada paga, nada alterado.

## Execução controlada (quando você pedir)
Sim, consigo: depois que o código/migração estiverem no projeto e você autorizar, rodo a função só no servidor, para um imóvel/marca e até 3 fotos por vez, sem expor a chave. Pontos de atenção:
- Cada foto é uma chamada paga (qualidade alta).
- Créditos insuficientes (402) ou bloqueio (403) pausam a rotina, como já previsto no código.
- Antes de rodar, confirmo marca, imóvel e quantas fotos.

## Próximo passo
Nenhuma ação agora. Aguardo seu código e o pedido de execução.
