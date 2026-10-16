import type { z } from "zod";
import type { AgentContext, AgentRole } from "../security";
export interface AgentToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
}
export interface AgentTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  roles: AgentRole[];
  handler(input: any, ctx: AgentContext): Promise<AgentToolResult>;
}
export const result = (
  text: string,
  structuredContent: Record<string, unknown>,
): AgentToolResult => ({ content: [{ type: "text", text }], structuredContent });
