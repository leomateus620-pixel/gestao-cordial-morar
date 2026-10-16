import { z } from "zod";
import type { GatewayCall, GatewayCompletion, GatewayMessage, GatewayRequest } from "../chat.server";

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };
type AnthropicMessage = { role: "user" | "assistant"; content: Block[] };

/** Translates the Chat Completions transcript into native Messages blocks. */
export function toAnthropicMessages(messages: GatewayMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content ?? "")
    .join("\n\n");
  const out: AnthropicMessage[] = [];
  const push = (role: "user" | "assistant", block: Block) => {
    const last = out.at(-1);
    if (last?.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      push("user", { type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content ?? "" });
      continue;
    }
    if (m.content) push(m.role, { type: "text", text: m.content });
    for (const call of m.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        input = {};
      }
      push("assistant", { type: "tool_use", id: call.id, name: call.function.name, input });
    }
  }
  return { system, messages: out };
}

/** Native /v1/messages streaming; never retried automatically. */
export async function anthropicCompletion(
  request: GatewayRequest,
  config: { apiKey: string; model: string; maxTokens?: number; fetcher?: typeof fetch },
): Promise<GatewayCompletion> {
  const { system, messages } = toAnthropicMessages(request.messages);
  const response = await (config.fetcher ?? fetch)("https://ai.gateway.lovable.dev/v1/messages", {
    method: "POST",
    signal: request.signal,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens ?? 4000,
      stream: true,
      ...(system ? { system } : {}),
      messages,
      ...(request.tools.length
        ? {
            tools: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: z.toJSONSchema(tool.inputSchema, { unrepresentable: "any" }),
            })),
            tool_choice: { type: "auto" },
          }
        : {}),
    }),
  });
  if (!response.ok || !response.body) {
    if (response.status === 429) throw new Error("gateway_rate_limit");
    if (response.status === 402) throw new Error("gateway_no_credits");
    if (response.status === 403) throw new Error("gateway_denied");
    throw new Error("gateway_unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, GatewayCall>();
  let pending = "",
    text = "",
    bytes = 0,
    completed = false,
    refused = false,
    inputTokens = 0,
    outputTokens = 0,
    cachedTokens = 0;
  const parse = (line: string) => {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw) return;
    const e = JSON.parse(raw) as {
      type?: string;
      index?: number;
      message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number } };
      content_block?: { type?: string; id?: string; name?: string };
      delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
      usage?: { output_tokens?: number };
    };
    if (e.type === "error") throw new Error("gateway_unavailable");
    if (e.type === "message_start") {
      inputTokens = e.message?.usage?.input_tokens ?? 0;
      cachedTokens = e.message?.usage?.cache_read_input_tokens ?? 0;
    }
    if (e.type === "content_block_start" && e.content_block?.type === "tool_use") {
      const index = e.index ?? 0;
      if (calls.size >= 8) throw new Error("tool_limit");
      calls.set(index, { id: e.content_block.id ?? "", name: e.content_block.name ?? "", arguments: "" });
    }
    if (e.type === "content_block_delta") {
      if (e.delta?.type === "text_delta" && e.delta.text) {
        text += e.delta.text;
        request.onText?.(e.delta.text);
      }
      if (e.delta?.type === "input_json_delta") {
        const call = calls.get(e.index ?? 0);
        if (call) {
          call.arguments += e.delta.partial_json ?? "";
          if (call.arguments.length > 8000) throw new Error("invalid_tool_call");
        }
      }
    }
    if (e.type === "message_delta") {
      if (e.delta?.stop_reason === "refusal") refused = true;
      outputTokens = e.usage?.output_tokens ?? outputTokens;
    }
    if (e.type === "message_stop") completed = true;
  };
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read();
      bytes += value?.byteLength ?? 0;
      if (bytes > 512_000) throw new Error("gateway_response_too_long");
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) parse(line.trimEnd());
      if (done) break;
    }
    if (pending.trim()) parse(pending.trimEnd());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (refused) throw new Error("gateway_refused");
  if (!completed) throw new Error("gateway_incomplete_response");
  return {
    text,
    calls: [...calls.values()].map((c) => ({ ...c, arguments: c.arguments || "{}" })),
    usage: { promptTokens: inputTokens, completionTokens: outputTokens, cachedTokens },
  };
}
