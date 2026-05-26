#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatResult, toolDefinitions } from "./tools.js";

const server = new McpServer({
  name: "boltz-mcpb",
  version: "0.1.0"
});

for (const tool of toolDefinitions) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: tool.inputSchema
    },
    async (args) => {
      try {
        return formatResult(await tool.handler(args));
      } catch (error) {
        return formatResult({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          tool: tool.name
        });
      }
    }
  );
}

await server.connect(new StdioServerTransport());
