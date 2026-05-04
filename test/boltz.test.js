import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDownloadArgs,
  buildInstallPlan,
  buildInputRef,
  buildRetrieveArgs,
  buildWorkflowCommands,
  downloadResults,
  resolvePollInterval,
  workflowSpecs
} from "../server/boltz.js";
import { toolDefinitions } from "../server/tools.js";

test("all workflow tools are registered", () => {
  const names = new Set(toolDefinitions.map((tool) => tool.name));
  for (const name of Object.keys(workflowSpecs)) {
    assert.equal(names.has(name), true);
  }
  assert.equal(names.has("boltz_check_setup"), true);
  assert.equal(names.has("boltz_install_cli"), true);
  assert.equal(names.has("boltz_auth_login"), true);
  assert.equal(names.has("boltz_download_results"), true);
  assert.equal(names.has("boltz_job_status"), true);
});

test("workflow commands match the skills CLI shape", () => {
  const commands = buildWorkflowCommands(workflowSpecs.boltz_protein_design, {
    run_name: "nanobody-gfp-v1",
    inputRef: "@json:///tmp/payload.json",
    output_root: "/tmp/boltz-results",
    workspace_id: "ws_123",
    poll_interval_seconds: 60
  }, {
    outputRoot: "/tmp/fallback",
    defaultPollIntervalSeconds: 30
  });

  assert.deepEqual(commands.estimate, [
    "protein:design",
    "estimate-cost",
    "--input",
    "@json:///tmp/payload.json",
    "--workspace-id",
    "ws_123"
  ]);
  assert.deepEqual(commands.start, [
    "protein:design",
    "start",
    "--idempotency-key",
    "nanobody-gfp-v1",
    "--input",
    "@json:///tmp/payload.json",
    "--raw-output",
    "--transform",
    "id",
    "--workspace-id",
    "ws_123"
  ]);
  assert.deepEqual(commands.download, [
    "download-results",
    "--id",
    "<job-id>",
    "--name",
    "nanobody-gfp-v1",
    "--root-dir",
    "/tmp/boltz-results",
    "--poll-interval-seconds",
    "60",
    "--workspace-id",
    "ws_123"
  ]);
});

test("download command uses resume-friendly run name and root", () => {
  assert.deepEqual(buildDownloadArgs({
    id: "job_123",
    run_name: "screen-v1",
    output_root: "/tmp/boltz",
    poll_interval_seconds: 30
  }), [
    "download-results",
    "--id",
    "job_123",
    "--name",
    "screen-v1",
    "--root-dir",
    "/tmp/boltz",
    "--poll-interval-seconds",
    "30"
  ]);
});

test("poll interval precedence is explicit arg, user default, workflow default", () => {
  const spec = workflowSpecs.boltz_structure_and_binding;
  assert.equal(resolvePollInterval({ poll_interval_seconds: 45 }, spec, { defaultPollIntervalSeconds: 17 }), 45);
  assert.equal(resolvePollInterval({}, spec, { defaultPollIntervalSeconds: 17 }), 17);
  assert.equal(resolvePollInterval({}, spec, {}), 10);
});

test("install plan uses official platform installers", () => {
  assert.deepEqual(buildInstallPlan({ install_dir: "/tmp/boltz-bin" }, "darwin"), {
    command: "sh",
    args: ["<downloaded official installer>"],
    download: {
      command: "curl",
      args: ["-fsSL", "https://install.boltz.bio/boltz-api/install.sh", "-o", "<temp-installer-path>"]
    },
    env: {
      BOLTZ_API_INSTALL_DIR: "/tmp/boltz-bin"
    }
  });
  assert.deepEqual(buildInstallPlan({}, "win32"), {
    command: "powershell.exe",
    args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://install.boltz.bio/boltz-api/install.ps1 | iex"],
    env: {}
  });
});

test("download result startup reports immediate spawn errors", async () => {
  const result = await downloadResults({
    id: "job_123",
    run_name: "bad-cli-v1",
    output_root: "/tmp/boltz",
    poll_interval_seconds: 30
  }, {
    cliPath: "/definitely/missing/boltz-api",
    outputRoot: "/tmp/boltz",
    defaultPollIntervalSeconds: 30,
    apiKey: ""
  });
  assert.equal(result.status, "error");
  assert.match(result.error, /ENOENT|spawn/);
});

test("input refs use file-url style json references", () => {
  assert.equal(buildInputRef("/tmp/boltz payload.json"), "@json:///tmp/boltz%20payload.json");
});

test("remote job status passes workspace id to retrieve", () => {
  assert.deepEqual(buildRetrieveArgs({
    id: "job_123",
    resource: "protein:design",
    workspace_id: "ws_123"
  }), [
    "protein:design",
    "retrieve",
    "--id",
    "job_123",
    "--format",
    "json",
    "--workspace-id",
    "ws_123"
  ]);
});
