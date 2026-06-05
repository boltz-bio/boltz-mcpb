import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

test("server responds to initialize and tools/list", async () => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url),
    stdio: ["pipe", "pipe", "pipe"]
  });
  let buffer = "";
  const responses = [];
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });

  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "boltz-mcpb-test", version: "0.1.0" }
    }
  }) + "\n");

  const initialize = await waitForResponse(responses, 1);
  assert.equal(initialize.result.serverInfo.version, version);
  assert.match(initialize.result.instructions, /boltz_get_guidance/);
  assert.equal(Boolean(initialize.result.capabilities.resources), true);
  assert.equal(Boolean(initialize.result.capabilities.prompts), true);
  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  }) + "\n");
  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  }) + "\n");

  const tools = await waitForResponse(responses, 2);
  const toolList = tools.result.tools;
  const names = toolList.map((tool) => tool.name);
  assert.equal(names.includes("boltz_check_setup"), true);
  assert.equal(names.includes("boltz_get_guidance"), true);
  assert.equal(names.includes("boltz_protein_design"), true);
  assert.equal(names.includes("boltz_download_results"), true);
  assert.equal(toolList.find((tool) => tool.name === "boltz_check_setup").annotations.readOnlyHint, true);
  assert.equal(toolList.find((tool) => tool.name === "boltz_get_guidance").annotations.readOnlyHint, true);
  assert.equal(toolList.find((tool) => tool.name === "boltz_protein_design").annotations.readOnlyHint, false);
  assert.equal(toolList.find((tool) => tool.name === "boltz_download_results").annotations.idempotentHint, true);

  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "resources/list",
    params: {}
  }) + "\n");
  const resources = await waitForResponse(responses, 3);
  const resourceUris = resources.result.resources.map((resource) => resource.uri);
  assert.equal(resourceUris.includes("boltz://guides/protein-design"), true);

  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "resources/read",
    params: {
      uri: "boltz://guides/protein-design"
    }
  }) + "\n");
  const resource = await waitForResponse(responses, 4);
  assert.match(resource.result.contents[0].text, /protein binders/i);

  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 5,
    method: "prompts/list",
    params: {}
  }) + "\n");
  const prompts = await waitForResponse(responses, 5);
  const promptNames = prompts.result.prompts.map((prompt) => prompt.name);
  assert.equal(promptNames.includes("boltz_protein_design_workflow"), true);

  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 6,
    method: "prompts/get",
    params: {
      name: "boltz_protein_design_workflow",
      arguments: {
        request: "Design a binder for a supplied target sequence.",
        run_name: "binder-design-v1"
      }
    }
  }) + "\n");
  const prompt = await waitForResponse(responses, 6);
  assert.match(prompt.result.messages[0].content.text, /binder-design-v1/);
  assert.match(prompt.result.messages[0].content.text, /Bundled guidance/);

  child.kill("SIGTERM");
  await once(child, "close");
});

async function waitForResponse(responses, id) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const response = responses.find((item) => item.id === id);
    if (response) return response;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for response ${id}`);
}
