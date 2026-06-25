import { z } from "zod";
import {
  getGuidance,
  guidanceTopicIds,
  workflowDescription,
  workflowGuideIds
} from "./guidance.js";
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
  run_name: z.string().min(1).describe("Stable slug used as the idempotency key and result-download run name. Reuse it when retrying the same intended job."),
  payload: z.record(z.unknown()).optional().describe("Valid Boltz API JSON payload for this exact workflow. Ask for missing biological inputs instead of guessing."),
  payload_text: z.string().optional().describe("Raw JSON payload text. Use this instead of payload only when exact formatting matters."),
  workspace_id: z.string().optional().describe("Optional Boltz workspace ID. Ask the user if they mention multiple workspaces and no ID is known."),
  output_root: z.string().optional().describe("Directory where downloaded results should be stored. Must resolve inside the configured Boltz output root."),
  start: z.boolean().optional().default(false).describe("Submit the paid job after estimate-cost succeeds. Defaults to false. Do not set true until the user confirms the estimate."),
  auto_download: z.boolean().optional().default(true).describe("After submit, start download-results in the background."),
  poll_interval_seconds: z.number().int().min(5).max(300).optional().describe("Seconds between result-download status checks."),
  working_directory: z.string().optional().describe("Advanced: working directory for local Boltz operations. Must resolve inside the configured Boltz output root."),
  timeout_ms: z.number().int().min(1000).max(900000).optional().describe("Advanced: timeout for setup, estimate, or start operations.")
};

export const toolDefinitions = [
  {
    name: "boltz_check_setup",
    title: "Check Boltz setup",
    description: "Check whether Boltz is ready to run jobs, including access, authentication, and output directory configuration.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      output_root: z.string().optional().describe("Must resolve inside the configured Boltz output root.")
    },
    handler: checkSetup
  },
  {
    name: "boltz_install_cli",
    title: "Install Boltz",
    description: "Install or update the local Boltz components required to run workflows.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true
    },
    inputSchema: {
      install_dir: z.string().optional().describe("Optional install directory passed as BOLTZ_API_INSTALL_DIR on macOS/Linux."),
      working_directory: z.string().optional().describe("Must resolve inside the configured Boltz output root."),
      timeout_ms: z.number().int().min(1000).max(900000).optional()
    },
    handler: installCli
  },
  {
    name: "boltz_auth_login",
    title: "Sign in to Boltz",
    description: "Start Boltz sign-in and return the login instructions needed to connect your account.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    inputSchema: {
      working_directory: z.string().optional().describe("Must resolve inside the configured Boltz output root."),
      timeout_ms: z.number().int().min(1000).max(900000).optional()
    },
    handler: authLogin
  },
  {
    name: "boltz_get_guidance",
    title: "Get Boltz guidance",
    description: [
      "Read bundled Boltz workflow guidance before preparing payloads or calling paid workflow tools.",
      "This is read-only and does not call the Boltz API.",
      "Use it when the user asks to run, design, screen, predict, estimate, download, resume, install, or authenticate with Boltz."
    ].join(" "),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    inputSchema: {
      workflow: z.enum(workflowGuideIds).describe("Guide to read. Use protein-design for protein binder design, small-molecule-design for ligand generation, and structure-and-binding for structure or affinity prediction."),
      topic: z.enum(guidanceTopicIds).optional().describe("Optional section to focus on. Use full when preparing a payload for the first time.")
    },
    handler: getGuidance
  },
  ...Object.entries(workflowSpecs).map(([name, spec]) => ({
    name,
    title: spec.title,
    description: [
      spec.downloadResults === false
        ? `Estimate and optionally start a Boltz ${spec.title.toLowerCase()} workflow, then retrieve inline results with boltz_job_status.`
        : `Estimate and optionally start a Boltz ${spec.title.toLowerCase()} workflow, then optionally download results.`,
      workflowDescription(name)
    ].join(" "),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    inputSchema: payloadSchema,
    handler: (args) => runWorkflow(name, args)
  })),
  {
    name: "boltz_download_results",
    title: "Download Boltz results",
    description: "Start or resume downloading results for an existing Boltz job.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    inputSchema: {
      id: z.string().min(1).describe("Boltz job ID."),
      run_name: z.string().min(1).describe("Run name used for local result directory and resume checkpoint."),
      output_root: z.string().optional().describe("Must resolve inside the configured Boltz output root."),
      workspace_id: z.string().optional(),
      poll_interval_seconds: z.number().int().min(5).max(300).optional(),
      working_directory: z.string().optional().describe("Must resolve inside the configured Boltz output root.")
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
      output_root: z.string().optional().describe("Must resolve inside the configured Boltz output root."),
      id: z.string().optional(),
      workspace_id: z.string().optional().describe("Optional Boltz workspace ID for remote retrieve calls."),
      resource: z.enum([
        "predictions:structure-and-binding",
        "predictions:adme",
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
