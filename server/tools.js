import { z } from "zod";
import {
  authLogin,
  checkSetup,
  downloadResults,
  installCli,
  jobStatus,
  runWorkflow,
  workflowSpecs
} from "./boltz.js";

const payloadSchema = {
  run_name: z.string().min(1).describe("Stable slug used as idempotency key and download run name."),
  payload: z.record(z.unknown()).optional().describe("Boltz API payload object. The server writes it as JSON and passes it to --input."),
  payload_text: z.string().optional().describe("Raw JSON payload text. Use this instead of payload when exact formatting matters."),
  workspace_id: z.string().optional().describe("Optional Boltz workspace ID."),
  output_root: z.string().optional().describe("Directory where downloaded results should be stored."),
  start: z.boolean().optional().default(false).describe("Submit the paid job after estimate-cost succeeds. Defaults to false so users can review estimates first."),
  auto_download: z.boolean().optional().default(true).describe("After submit, start download-results in the background."),
  poll_interval_seconds: z.number().int().min(5).max(300).optional().describe("download-results poll interval."),
  working_directory: z.string().optional().describe("Working directory for boltz-api commands."),
  timeout_ms: z.number().int().min(1000).max(900000).optional().describe("Timeout for estimate/start CLI calls.")
};

export const toolDefinitions = [
  {
    name: "boltz_check_setup",
    title: "Check Boltz setup",
    description: "Check boltz-api availability, version, auth status, and output directory configuration.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      boltz_api_path: z.string().optional(),
      output_root: z.string().optional()
    },
    handler: checkSetup
  },
  {
    name: "boltz_install_cli",
    title: "Install Boltz CLI",
    description: "Install or update boltz-api using the official Boltz installer. This is an explicit setup action.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true
    },
    inputSchema: {
      install_dir: z.string().optional().describe("Optional install directory passed as BOLTZ_API_INSTALL_DIR on macOS/Linux."),
      working_directory: z.string().optional(),
      timeout_ms: z.number().int().min(1000).max(900000).optional()
    },
    handler: installCli
  },
  {
    name: "boltz_auth_login",
    title: "Authenticate Boltz CLI",
    description: "Start boltz-api device-code authentication and return the login instructions from the CLI.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    inputSchema: {
      boltz_api_path: z.string().optional(),
      working_directory: z.string().optional(),
      timeout_ms: z.number().int().min(1000).max(900000).optional()
    },
    handler: authLogin
  },
  ...Object.entries(workflowSpecs).map(([name, spec]) => ({
    name,
    title: spec.title,
    description: `Estimate and optionally start a Boltz ${spec.title.toLowerCase()} workflow using boltz-api, then optionally launch download-results. When start=true this consumes Boltz credits.`,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true
    },
    inputSchema: payloadSchema,
    handler: (args) => runWorkflow(name, args)
  })),
  {
    name: "boltz_download_results",
    title: "Download Boltz results",
    description: "Start or resume boltz-api download-results for an existing job and run name.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      id: z.string().min(1).describe("Boltz job ID."),
      run_name: z.string().min(1).describe("Run name used for local result directory and resume checkpoint."),
      output_root: z.string().optional(),
      workspace_id: z.string().optional(),
      poll_interval_seconds: z.number().int().min(5).max(300).optional(),
      working_directory: z.string().optional()
    },
    handler: downloadResults
  },
  {
    name: "boltz_job_status",
    title: "Check Boltz job status",
    description: "Inspect a running downloader, local download-status, remote retrieve status, or active downloaders.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      downloader_handle: z.string().optional(),
      run_name: z.string().optional(),
      output_root: z.string().optional(),
      id: z.string().optional(),
      workspace_id: z.string().optional().describe("Optional Boltz workspace ID for remote retrieve calls."),
      resource: z.enum([
        "predictions:structure-and-binding",
        "small-molecule:library-screen",
        "small-molecule:design",
        "protein:library-screen",
        "protein:design"
      ]).optional(),
      timeout_ms: z.number().int().min(1000).max(300000).optional()
    },
    handler: jobStatus
  }
];

export function formatResult(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}
