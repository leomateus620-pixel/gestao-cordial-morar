# Corrigir a tela escura na imagem de abertura do site Morar

## O que acontece
A página inicial da Morar recarrega os dados da abertura a cada minuto (e ao voltar para a home). Durante essa recarga a foto sai da tela e fica só o fundo marrom-escuro, até a nova resposta chegar. Na Cordial isso foi resolvido guardando a última abertura válida; a Morar ficou sem essa proteção.

## O que vou fazer
1. Na página inicial da Morar, manter a última abertura válida (foto, card e destaques) visível enquanto a atualização acontece em segundo plano — a foto nunca some nem escurece.
2. Respeitar a retirada de imóvel: quando a atualização confirmar que o imóvel saiu, a abertura troca diretamente para o próximo imóvel/estado neutro, sem passar pela tela escura. Falha de conexão nunca apaga a foto atual.
3. Guardar a memória separada por marca, para Cordial e Morar nunca trocarem fotos entre si.
4. Aumentar o intervalo de atualização da home Morar para 5 minutos, igual à Cordial.
5. Conferir se a animação lenta da foto termina sem "pulo" ao reiniciar (já vai e volta suavemente; só ajusto se o teste mostrar corte).

## Como vou verificar
- Abrir a home Morar na prévia, esperar mais de um ciclo da animação e da atualização, e ir à ficha e voltar: a foto deve permanecer visível o tempo todo (capturas em sequência).
- Confirmar que a Cordial continua igual.
- Nada é publicado sem sua autorização.

## Detalhes técnicos
- `src/routes/site-morar.index.tsx`: adotar o padrão `lastHome` de `site.index.tsx` (cache só no navegador, `staleTime` 5 min), mas resolvendo com o resultado novo quando ele confirmar ausência de hero (retirada), e com o cache apenas em erro/rede.
- Opcional: extrair o helper para `src/lib/cordial-site/home-loader.ts` com cache por marca, usado pelas duas rotas.
