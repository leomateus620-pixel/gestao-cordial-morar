import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { anthropicCompletion, toAnthropicMessages } from "./anthropic";

const sse = (events: unknown[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        // split frames to exercise buffering
        for (const e of events) {
          const s = `data: ${JSON.stringify(e)}\n\n`;
          c.enqueue(enc.encode(s.slice(0, 7)));
          c.enqueue(enc.encode(s.slice(7)));
        }
        c.close();
      },
    }),
    { status: 200 },
  );

describe("claude adapter", () => {
  it("translates system, tool calls and tool results", () => {
    const r = toAnthropicMessages([
      { role: "system", content: "S" },
      { role: "user", content: "oi" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "t1", type: "function", function: { name: "x", arguments: '{"a":1}' } }],
      },
      { role: "tool", tool_call_id: "t1", content: "{}" },
    ]);
    expect(r.system).toBe("S");
    expect(r.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(r.messages[1]!.content[0]).toEqual({ type: "tool_use", id: "t1", name: "x", input: { a: 1 } });
  });

  it("streams text and tool input through split frames", async () => {
    let body: Record<string, unknown> = {};
    const fetcher = (async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return sse([
        { type: "message_start", message: { usage: { input_tokens: 10 } } },
        { type: "ping" },
        { type: "content_block_start", index: 0, content_block: { type: "text" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Olá." } },
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "c1", name: "busca" } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"q":' } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"x"}' } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ]);
    }) as typeof fetch;
    const out = await anthropicCompletion(
      {
        messages: [{ role: "user", content: "oi" }],
        tools: [{ name: "busca", description: "d", inputSchema: z.object({ q: z.string() }) } as never],
        signal: new AbortController().signal,
      },
      { apiKey: "k", model: "anthropic/claude-sonnet-5", fetcher },
    );
    expect(body.stream).toBe(true);
    expect(out.text).toBe("Olá.");
    expect(out.calls).toEqual([{ id: "c1", name: "busca", arguments: '{"q":"x"}' }]);
    expect(out.usage).toEqual({ promptTokens: 10, completionTokens: 5, cachedTokens: 0 });
  });

  it("treats refusal as terminal", async () => {
    const fetcher = (async () =>
      sse([
        { type: "message_delta", delta: { stop_reason: "refusal" } },
        { type: "message_stop" },
      ])) as unknown as typeof fetch;
    await expect(
      anthropicCompletion(
        { messages: [{ role: "user", content: "x" }], tools: [], signal: new AbortController().signal },
        { apiKey: "k", model: "anthropic/claude-sonnet-5", fetcher },
      ),
    ).rejects.toThrow("gateway_refused");
  });
});
