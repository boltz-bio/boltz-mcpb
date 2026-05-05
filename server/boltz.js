import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const workflowSpecs = {
  boltz_structure_and_binding: {
    resource: "predictions:structure-and-binding",
    title: "Structure and binding",
    defaultPollIntervalSeconds: 10
  },
  boltz_small_molecule_screen: {
    resource: "small-molecule:library-screen",
    title: "Small-molecule screen",
    defaultPollIntervalSeconds: 30
  },
  boltz_small_molecule_design: {
    resource: "small-molecule:design",
    title: "Small-molecule design",
    defaultPollIntervalSeconds: 60
  },
  boltz_protein_screen: {
    resource: "protein:library-screen",
    title: "Protein screen",
    defaultPollIntervalSeconds: 30
  },
  boltz_protein_design: {
    resource: "protein:design",
    title: "Protein design",
    defaultPollIntervalSeconds: 60
  }
};

const downloaderProcesses = new Map();

export function getConfig(env = process.env) {
  return {
    cliPath: resolveCliPath(env),
    outputRoot: env.BOLTZ_MCPB_OUTPUT_ROOT || path.join(env.HOME || process.cwd(), "boltz-experiments"),
    defaultPollIntervalSeconds: env.BOLTZ_MCPB_DEFAULT_POLL_INTERVAL_SECONDS
      ? parseNumber(env.BOLTZ_MCPB_DEFAULT_POLL_INTERVAL_SECONDS, 30)
      : undefined,
    apiKey: env.BOLTZ_MCPB_API_KEY || env.BOLTZ_API_KEY || ""
  };
}

export function resolveCliPath(env = process.env) {
  const override = env.BOLTZ_MCPB_CLI_PATH || env.BOLTZ_API_PATH;
  if (override) return override;

  const executableName = process.platform === "win32" ? "boltz-api.exe" : "boltz-api";
  const pathMatch = findOnPath(executableName, env.PATH || "");
  if (pathMatch) return pathMatch;

  for (const candidate of defaultCliCandidates(env, executableName)) {
    if (existsSync(candidate)) return candidate;
  }
  return "boltz-api";
}

export function defaultCliCandidates(env = process.env, executableName = process.platform === "win32" ? "boltz-api.exe" : "boltz-api") {
  const homes = [env.HOME, env.USERPROFILE].filter(Boolean);
  return homes.flatMap((home) => [
    path.join(home, ".local", "bin", executableName),
    path.join(home, "bin", executableName)
  ]);
}

function findOnPath(executableName, pathValue) {
  const separator = process.platform === "win32" ? ";" : ":";
  for (const directory of String(pathValue || "").split(separator)) {
    if (!directory) continue;
    const candidate = path.join(directory, executableName);
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildWorkflowCommands(spec, args, config) {
  const inputRef = args.inputRef;
  const workspaceArgs = args.workspace_id ? ["--workspace-id", args.workspace_id] : [];
  const estimate = [spec.resource, "estimate-cost", "--input", inputRef, ...workspaceArgs];
  const start = [
    spec.resource,
    "start",
    "--idempotency-key",
    args.run_name,
    "--input",
    inputRef,
    "--raw-output",
    "--transform",
    "id",
    ...workspaceArgs
  ];
  const download = buildDownloadArgs({
    id: "<job-id>",
    run_name: args.run_name,
    output_root: args.output_root || config.outputRoot,
    poll_interval_seconds: resolvePollInterval(args, spec, config),
    workspace_id: args.workspace_id
  });
  return { estimate, start, download };
}

export function resolvePollInterval(args, spec, config) {
  return args.poll_interval_seconds || config.defaultPollIntervalSeconds || spec.defaultPollIntervalSeconds || 30;
}

export function buildDownloadArgs(args) {
  const result = [
    "download-results",
    "--id",
    args.id,
    "--name",
    args.run_name,
    "--root-dir",
    args.output_root,
    "--poll-interval-seconds",
    String(args.poll_interval_seconds || 30)
  ];
  if (args.workspace_id) {
    result.push("--workspace-id", args.workspace_id);
  }
  return result;
}

export function buildInputRef(filePath) {
  return pathToFileURL(filePath).href.replace(/^file:/, "@json:");
}

export function buildRetrieveArgs(args) {
  const retrieveArgs = [args.resource, "retrieve", "--id", args.id, "--format", "json"];
  if (args.workspace_id) {
    retrieveArgs.push("--workspace-id", args.workspace_id);
  }
  return retrieveArgs;
}

export async function runCommand(cliPath, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  const env = { ...process.env, ...options.env };
  if (options.apiKey) {
    env.BOLTZ_API_KEY = options.apiKey;
  }
  return new Promise((resolve) => {
    const child = spawn(cliPath, args, {
      cwd: options.cwd || process.cwd(),
      env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr, error: error.message, args });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        args
      });
    });
  });
}

export async function writePayloadFile(payload, payloadText, workingDirectory = process.cwd()) {
  const root = path.join(tmpdir(), "boltz-mcpb");
  await mkdir(root, { recursive: true });
  const file = path.join(root, `payload-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const body = payloadText ?? JSON.stringify(payload, null, 2);
  await writeFile(file, body, "utf8");
  return path.resolve(workingDirectory, file);
}

export async function checkSetup(args = {}, config = getConfig()) {
  const cliPath = config.cliPath;
  const version = await runCommand(cliPath, ["--version"], { timeoutMs: 30000, apiKey: config.apiKey });
  const auth = version.ok
    ? await runCommand(cliPath, ["auth", "status"], { timeoutMs: 30000, apiKey: config.apiKey })
    : { ok: false, stdout: "", stderr: "Skipped auth status because boltz-api is not available." };
  return {
    cli_path: cliPath,
    cli_available: version.ok,
    version_stdout: version.stdout,
    version_stderr: version.stderr,
    auth_ok: auth.ok,
    auth_stdout: auth.stdout,
    auth_stderr: auth.stderr,
    output_root: args.output_root || config.outputRoot,
    next_step: version.ok
      ? auth.ok
        ? "Ready to run Boltz workflows."
        : "Run boltz_auth_login or set BOLTZ_API_KEY."
      : "Run boltz_install_cli or install boltz-api from https://install.boltz.bio/boltz-api/install.sh."
  };
}

export async function installCli(args = {}, config = getConfig()) {
  const platform = args.platform || process.platform;
  if (platform === "win32") {
    return runCommand(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://install.boltz.bio/boltz-api/install.ps1 | iex"],
      { timeoutMs: args.timeout_ms || 300000 }
    );
  }
  const scriptPath = path.join(tmpdir(), `boltz-api-install-${Date.now()}.sh`);
  const download = await runCommand("curl", ["-fsSL", "https://install.boltz.bio/boltz-api/install.sh", "-o", scriptPath], {
    timeoutMs: args.timeout_ms || 120000
  });
  if (!download.ok) return download;
  return runCommand("sh", [scriptPath], {
    timeoutMs: args.timeout_ms || 300000,
    env: args.install_dir ? { BOLTZ_API_INSTALL_DIR: args.install_dir } : {},
    cwd: args.working_directory || process.cwd()
  });
}

export function buildInstallPlan(args = {}, platform = process.platform) {
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://install.boltz.bio/boltz-api/install.ps1 | iex"],
      env: {}
    };
  }
  return {
    command: "sh",
    args: ["<downloaded official installer>"],
    download: {
      command: "curl",
      args: ["-fsSL", "https://install.boltz.bio/boltz-api/install.sh", "-o", "<temp-installer-path>"]
    },
    env: args.install_dir ? { BOLTZ_API_INSTALL_DIR: args.install_dir } : {}
  };
}

export async function authLogin(args = {}, config = getConfig()) {
  const loginArgs = ["auth", "login", "--device-code"];
  return startInteractiveCommand(config.cliPath, loginArgs, {
    timeoutMs: args.timeout_ms || 15000,
    cwd: args.working_directory || process.cwd(),
    apiKey: config.apiKey,
    label: "boltz-api auth login --device-code",
    nextStep: "Complete the Boltz device-code sign-in, then call boltz_check_setup again."
  });
}

export function startInteractiveCommand(cliPath, args, options = {}) {
  const env = { ...process.env, ...options.env };
  if (options.apiKey) {
    env.BOLTZ_API_KEY = options.apiKey;
  }
  return new Promise((resolve) => {
    const child = spawn(cliPath, args, {
      cwd: options.cwd || process.cwd(),
      env,
      shell: false
    });
    const record = {
      command: options.label || [cliPath, ...args].join(" "),
      pid: child.pid,
      status: "running",
      stdout_tail: "",
      stderr_tail: "",
      next_step: options.nextStep || "Complete the interactive action, then call boltz_check_setup again."
    };
    const resolveOnce = () => resolve({ ...record });
    const timer = setTimeout(resolveOnce, options.timeoutMs || 15000);
    child.stdout?.on("data", (chunk) => {
      record.stdout_tail = tail(record.stdout_tail + chunk.toString());
    });
    child.stderr?.on("data", (chunk) => {
      record.stderr_tail = tail(record.stderr_tail + chunk.toString());
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      record.status = "error";
      record.error = error.message;
      resolve({ ...record });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      record.status = code === 0 ? "completed" : "failed";
      record.code = code;
      record.signal = signal;
      resolve({ ...record });
    });
  });
}

export async function runWorkflow(toolName, args, config = getConfig()) {
  const spec = workflowSpecs[toolName];
  if (!spec) throw new Error(`Unknown workflow tool: ${toolName}`);
  if (!args.run_name) throw new Error("run_name is required.");
  if (!args.payload && !args.payload_text) throw new Error("payload or payload_text is required.");

  const cwd = args.working_directory || process.cwd();
  const payloadPath = await writePayloadFile(args.payload, args.payload_text, cwd);
  const inputRef = buildInputRef(payloadPath);
  const outputRoot = args.output_root || config.outputRoot;
  const commands = buildWorkflowCommands(spec, { ...args, inputRef, output_root: outputRoot }, config);

  const estimate = await runCommand(config.cliPath, commands.estimate, {
    cwd,
    timeoutMs: args.timeout_ms || 120000,
    apiKey: config.apiKey
  });
  const shouldStart = args.start === true;
  if (!estimate.ok || !shouldStart) {
    return {
      workflow: toolName,
      run_name: args.run_name,
      payload_path: payloadPath,
      output_root: outputRoot,
      estimate,
      started: false,
      next_step: estimate.ok
        ? "Review the estimate. To submit this paid job, call this workflow again with start: true and the same run_name."
        : "Fix the payload or setup error before retrying."
    };
  }

  const start = await runCommand(config.cliPath, commands.start, {
    cwd,
    timeoutMs: args.timeout_ms || 120000,
    apiKey: config.apiKey
  });
  if (!start.ok) {
    return {
      workflow: toolName,
      run_name: args.run_name,
      payload_path: payloadPath,
      output_root: outputRoot,
      estimate,
      start,
      started: false,
      next_step: "The job was not submitted successfully. Inspect start stderr/stdout and retry with the same run_name if appropriate."
    };
  }

  const jobId = start.stdout.trim();
  let downloader = null;
  if (args.auto_download !== false) {
    downloader = await startDownloadProcess({
      id: jobId,
      run_name: args.run_name,
      output_root: outputRoot,
      poll_interval_seconds: resolvePollInterval(args, spec, config),
      workspace_id: args.workspace_id,
      working_directory: cwd
    }, config);
  }

  return {
    workflow: toolName,
    run_name: args.run_name,
    job_id: jobId,
    payload_path: payloadPath,
    output_root: outputRoot,
    estimate,
    start,
    started: true,
    downloader
  };
}

export async function startDownloadProcess(args, config = getConfig()) {
  const downloadArgs = buildDownloadArgs({
    id: args.id,
    run_name: args.run_name,
    output_root: args.output_root || config.outputRoot,
    poll_interval_seconds: args.poll_interval_seconds || config.defaultPollIntervalSeconds || 30,
    workspace_id: args.workspace_id
  });
  const child = spawn(config.cliPath, downloadArgs, {
    cwd: args.working_directory || process.cwd(),
    env: config.apiKey ? { ...process.env, BOLTZ_API_KEY: config.apiKey } : process.env,
    shell: false
  });
  const handle = `${args.run_name}:${Date.now()}`;
  const record = {
    handle,
    pid: child.pid,
    run_name: args.run_name,
    output_root: args.output_root || config.outputRoot,
    args: downloadArgs,
    status: "running",
    stdout_tail: "",
    stderr_tail: ""
  };
  downloaderProcesses.set(handle, record);
  child.stdout?.on("data", (chunk) => {
    record.stdout_tail = tail(record.stdout_tail + chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    record.stderr_tail = tail(record.stderr_tail + chunk.toString());
  });
  child.on("error", (error) => {
    record.status = "error";
    record.error = error.message;
  });
  child.on("close", (code, signal) => {
    record.status = code === 0 ? "completed" : "failed";
    record.code = code;
    record.signal = signal;
  });
  await waitForInitialSpawn(record, child);
  return { ...record };
}

function waitForInitialSpawn(record, child) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 25);
    child.once("error", (error) => {
      clearTimeout(timer);
      record.status = "error";
      record.error = error.message;
      resolve();
    });
    child.once("spawn", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function tail(value, max = 8000) {
  return value.length > max ? value.slice(value.length - max) : value;
}

export async function downloadResults(args, config = getConfig()) {
  if (!args.id) throw new Error("id is required.");
  if (!args.run_name) throw new Error("run_name is required.");
  return startDownloadProcess(args, config);
}

export async function jobStatus(args, config = getConfig()) {
  if (args.downloader_handle && downloaderProcesses.has(args.downloader_handle)) {
    return { downloader: downloaderProcesses.get(args.downloader_handle) };
  }
  if (args.run_name) {
    const status = await runCommand(config.cliPath, [
      "--format",
      "json",
      "download-status",
      "--name",
      args.run_name,
      "--root-dir",
      args.output_root || config.outputRoot
    ], { timeoutMs: args.timeout_ms || 30000, apiKey: config.apiKey });
    return { download_status: status };
  }
  if (args.id && args.resource) {
    const retrieve = await runCommand(config.cliPath, buildRetrieveArgs(args), {
      timeoutMs: args.timeout_ms || 30000,
      apiKey: config.apiKey
    });
    return { retrieve };
  }
  return {
    active_downloaders: Array.from(downloaderProcesses.values())
  };
}
