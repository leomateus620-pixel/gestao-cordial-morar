# Interações dos mascotes

Todos os agentes usam `WorkerAvatar`, com a mesma resposta a cursor, toque e foco de teclado:

- Entrada do cursor: piscada de 380 ms e pequeno salto de 520 ms.
- Movimento sobre o ícone: olhos acompanham até 3,3/2,5 unidades e corpo inclina até 7°, com atualização por frame e transições curtas.
- Toque/clique: um giro de 820 ms, com corpo, brilho e rosto juntos; intervalo mínimo entre giros evita repetição contínua.
- Saída/cancelamento do ponteiro: volta à pose neutra. No toque, o olhar é liberado após 180 ms.
- Foco do botão/link por teclado: piscada e salto, sem acrescentar uma parada de Tab ao desenho.
- Consulta em andamento: oscilação do personagem no cabeçalho e na última resposta; encerra quando o trabalho termina.

Por solicitação explícita do usuário, essas animações permanecem ativas com `prefers-reduced-motion: reduce`. O restante da interface preserva sua preferência existente. Não há configuração nova de movimento no produto.

Os eventos não chamam `preventDefault`, `stopPropagation` ou captura de ponteiro. A rolagem e a ação do botão/link pai continuam disponíveis. Timers e frames são cancelados ao desmontar o componente.

## Verificação

No navegador, clique e arraste real sobre o mascote confirmaram `worker-spin`, `worker-blink` e alteração do olhar/inclinação. O foco por Tab confirmou a reação no próximo agente. O estado “Consultando” confirmou a oscilação nos dois avatares em trabalho.

O primeiro teste encontrou perda do clique ao recriar o grupo SVG durante `pointerdown`. A correção mantém o nó montado: clicar no desenho do Match seleciona o agente e abre o composer “Mensagem para Match”. A confirmação foi repetida no navegador após a correção.

A prévia local inicia com movimento ativo. O botão “Animações” pertence somente ao harness e permite congelar capturas. Captura estática: `screenshots/mascotes-interativos.jpg`. A reação ao toque físico deve ser conferida também no aparelho de homologação; os eventos não bloqueiam os gestos nativos.
