import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";

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

  await waitForResponse(responses, 1);
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
  assert.equal(names.includes("boltz_protein_design"), true);
  assert.equal(names.includes("boltz_download_results"), true);
  assert.equal(toolList.find((tool) => tool.name === "boltz_check_setup").annotations.readOnlyHint, true);
  assert.equal(toolList.find((tool) => tool.name === "boltz_protein_design").annotations.readOnlyHint, false);
  assert.equal(toolList.find((tool) => tool.name === "boltz_download_results").annotations.idempotentHint, true);

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
