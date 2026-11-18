import { GTM_MARKER, gtmHeadScript, gtmNoscriptSrc } from "./gtm-install";
import { isGtmId } from "./meta-pixel";

// React 19 hoists meta/title/link ahead of non-hoistable children during SSR, so the
// RootShell's GTM <script> lands at the end of <head>. This moves it right after the charset.
const SCRIPT_RE = new RegExp(
  `<script\\b[^>]*\\bdata-gtm="${GTM_MARKER}"[^>]*>[\\s\\S]*?<\\/script>`,
  "gi",
);
const NOSCRIPT_RE = new RegExp(`<noscript\\b[^>]*\\bdata-gtm="${GTM_MARKER}"`, "i");
const HEAD_OPEN_RE = /<head\b[^>]*>/i;
const CHARSET_RE = /^\s*<meta\b[^>]*\bcharset\s*=[^>]*>/i;

export function placeCordialGtmAtHeadTop(html: string, opts: { id?: string } = {}): string {
  const headOpen = HEAD_OPEN_RE.exec(html);
  if (!headOpen) return html;
  const headCloseAt = html.toLowerCase().indexOf("</head>", headOpen.index);
  if (headCloseAt < 0) return html;
  const headStart = headOpen.index + headOpen[0].length;
  let head = html.slice(headStart, headCloseAt);
  const scripts = head.match(SCRIPT_RE) ?? [];
  const validId = opts.id && isGtmId(opts.id) ? opts.id : null;
  let tag = scripts[0] ?? null;
  if (!tag && validId) tag = `<script data-gtm="${GTM_MARKER}">${gtmHeadScript(validId)}</script>`;
  if (tag) {
    head = head.replace(SCRIPT_RE, "");
    const charset = CHARSET_RE.exec(head);
    const at = charset ? charset[0].length : 0;
    head = head.slice(0, at) + tag + head.slice(at);
  }
  let rest = html.slice(headCloseAt);
  if (validId && !NOSCRIPT_RE.test(rest)) {
    rest = rest.replace(
      /<body\b[^>]*>/i,
      (b) =>
        `${b}<noscript data-gtm="${GTM_MARKER}"><iframe src="${gtmNoscriptSrc(validId)}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`,
    );
  }
  return html.slice(0, headStart) + head + rest;
}
