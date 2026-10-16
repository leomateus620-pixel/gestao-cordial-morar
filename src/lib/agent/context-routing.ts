import { getAgentBot, type AgentContextKind } from "./bots";

export type RecordContext = { kind: AgentContextKind; id: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function contextFromLocation(pathname: string, search: string): RecordContext | undefined {
  const detail = /^\/(imoveis|clientes)\/([^/]+)(?:\/)?$/.exec(pathname);
  if (detail && UUID.test(detail[2]))
    return { kind: detail[1] === "imoveis" ? "property" : "client", id: detail[2] };
  const kinds: Record<string, AgentContextKind> = {
    "/atendimentos": "attendance",
    "/agenda": "agenda",
    "/agenciamentos": "agenciamento",
    "/alugueis": "rental",
  };
  const id = new URLSearchParams(search).get("id");
  return kinds[pathname] && id && UUID.test(id) ? { kind: kinds[pathname], id } : undefined;
}

export function preferredBotForContext(context?: RecordContext): string {
  switch (context?.kind) {
    case "client":
    case "property":
      return "match";
    case "attendance":
      return "lead";
    case "agenciamento":
      return "capta";
    case "rental":
      return "caixa";
    default:
      return "agenda";
  }
}

/** Context must never cross into a colleague that cannot access that module. */
export function contextForActiveBot(
  botId: string,
  context?: RecordContext,
): RecordContext | undefined {
  const bot = getAgentBot(botId);
  return bot?.active && context && bot.contextKinds.includes(context.kind) ? context : undefined;
}

export function contextSuggestions(context?: RecordContext): string[] {
  switch (context?.kind) {
    case "client":
      return [
        "Encontre imóveis compatíveis com este cliente",
        "Resuma o cadastro deste cliente",
        "Quais preferências estão faltando?",
      ];
    case "property":
      return [
        "Resuma este imóvel",
        "Quais são os dados principais deste imóvel?",
        "Busque imóveis semelhantes",
      ];
    case "attendance":
      return [
        "Resuma este atendimento",
        "Qual é o próximo passo cadastrado?",
        "Quais dados preciso revisar?",
      ];
    case "rental":
      return [];
    case "agenciamento":
      return ["Quais pendências há neste agenciamento?", "Resuma esta captação"];
    case "agenda":
      return ["Resuma este compromisso", "Como está o restante do meu dia?"];
    default:
      return [
        "Como está minha agenda hoje?",
        "Quais visitas tenho amanhã?",
        "Resuma meus próximos compromissos",
      ];
  }
}
