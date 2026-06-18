## Problema

A pré-visualização usa um `<iframe>` apontando direto para `cordialimoveis.com` e `imobiliariamorarimoveis.com.br`. Ambos os sites enviam cabeçalhos `X-Frame-Options: SAMEORIGIN` / `Content-Security-Policy: frame-ancestors`, então o navegador **bloqueia silenciosamente** o carregamento dentro do sistema — o `onLoad` do iframe nunca dispara (ou dispara vazio), o skeleton fica eterno e só depois de 6,5 s aparece o aviso. Não é um bug de código nosso: é proteção dos sites.

Tentar contornar com iframe é inviável (não há proxy próprio e proxiar HTML quebraria CSS/JS dos sites). A solução leve é trocar o iframe por uma **imagem de screenshot** gerada por um serviço público de mShots (WordPress.com), que é gratuito, cacheado em CDN e não exige backend.

## Mudanças

Arquivo único: `src/components/real-estate-site-preview-section.tsx`

1. **Remover o `<iframe>`** e toda a lógica associada (`previewLoaded`, `previewUnavailable`, `setTimeout` de 6500 ms, `useEffect`).
2. **Adicionar componente de preview por imagem** usando `https://s.wordpress.com/mshots/v1/{encodedUrl}?w=1280&h=900`:
   - `<img>` com `loading="lazy"`, `decoding="async"`, `referrerPolicy="no-referrer"`.
   - Estado local simples: `status: "loading" | "ready" | "error"` controlado por `onLoad` / `onError`.
   - Skeleton sobreposto enquanto `status === "loading"`; card de fallback com botão "Abrir em nova aba" quando `status === "error"`.
   - mShots às vezes responde com placeholder enquanto gera a captura na primeira visita; tratar com 1 tentativa de retry automático após 4 s se ainda estiver em `loading`, depois cair em `error`.
3. **Manter** a UI do dialog (chrome de janela, header, rodapé com CTA), só substituindo a área interna do iframe pela imagem responsiva (`aspect-[16/11]` desktop, `aspect-[9/13]` mobile).
4. **Atualizar o texto** do header de "Se a prévia não carregar por proteção do site…" para algo mais claro: "Prévia gerada a partir de uma captura recente do site oficial."
5. **Pré-carregar leve nos cards da lista**: opcionalmente usar a mesma URL mShots com `w=600` como thumbnail discreto no card de cada imobiliária (sem abrir o modal), com `loading="lazy"`. Isso melhora a percepção de integração sistema↔site sem peso adicional (imagens cacheadas em CDN).

## Resultado esperado

- Prévia carrega como imagem em 1–3 s, sem ficar travada em skeleton.
- Sem chamadas pesadas; sem iframe bloqueado; sem timers longos.
- Fallback claro e botão para abrir o site real em nova aba quando a captura falhar.
- Funciona tanto para Cordial quanto para Morar com a mesma lógica.
