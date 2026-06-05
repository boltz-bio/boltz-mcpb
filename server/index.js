#!/usr/bin/env node
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { guidancePrompts, guidanceResources, serverInstructions } from "./guidance.js";
import { formatResult, toolDefinitions } from "./tools.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const server = new McpServer(
  {
    name: "boltz-mcpb",
    version
  },
  {
    instructions: serverInstructions
  }
);

for (const resource of guidanceResources) {
  server.registerResource(
    resource.name,
    resource.uri,
    {
      title: resource.title,
      description: resource.description,
      mimeType: resource.mimeType
    },
    resource.read
  );
}

for (const prompt of guidancePrompts) {
  server.registerPrompt(
    prompt.name,
    {
      title: prompt.title,
      description: prompt.description,
      argsSchema: prompt.argsSchema
    },
    prompt.getMessages
  );
}

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
