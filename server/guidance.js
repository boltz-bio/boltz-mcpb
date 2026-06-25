import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagedGuidanceRoot = path.resolve(__dirname, "..", "guidance");
const coreGuidanceRoot = path.resolve(__dirname, "..", "..", "..", "core");

export const workflowGuideIds = [
  "cli-setup",
  "check-status",
  "structure-and-binding",
  "small-molecule-adme",
  "small-molecule-screen",
  "small-molecule-design",
  "protein-screen",
  "protein-design"
];

export const guidanceTopicIds = [
  "overview",
  "full",
  "api",
  "results",
  "resume",
  "sandbox"
];

export const workflowGuides = [
  {
    id: "cli-setup",
    skillDir: "boltz-cli-setup",
    title: "Boltz CLI setup",
    toolName: "boltz_check_setup",
    resource: null,
    prompt: null,
    summary: "Install, update, verify, and authenticate the local boltz-api CLI.",
    references: ["sandbox"],
    sequence: ["boltz_check_setup", "boltz_install_cli if the CLI is missing or stale", "boltz_auth_login if authentication is missing or expired"]
  },
  {
    id: "check-status",
    skillDir: "boltz-check-status",
    title: "Boltz job status",
    toolName: "boltz_job_status",
    resource: null,
    prompt: "boltz_check_status_workflow",
    summary: "Inspect recent jobs, remote job progress, and local result-download state.",
    references: ["api", "resume"],
    sequence: ["boltz_get_guidance", "boltz_job_status", "boltz_download_results if results need to be resumed"]
  },
  {
    id: "structure-and-binding",
    skillDir: "boltz-structure-and-binding",
    title: "Structure and binding",
    toolName: "boltz_structure_and_binding",
    resource: "predictions:structure-and-binding",
    prompt: "boltz_structure_and_binding_workflow",
    summary: "Predict molecular structures and binding interactions.",
    references: ["api", "results"],
    sequence: ["boltz_check_setup", "boltz_get_guidance", "boltz_structure_and_binding with start=false", "ask for cost confirmation", "boltz_structure_and_binding with start=true"]
  },
  {
    id: "small-molecule-adme",
    skillDir: "boltz-small-molecule-adme",
    title: "Small-molecule ADME",
    toolName: "boltz_small_molecule_adme",
    resource: "predictions:adme",
    prompt: "boltz_small_molecule_adme_workflow",
    summary: "Predict Tier-1 ADME summary properties for small molecules.",
    references: ["api", "results"],
    sequence: ["boltz_check_setup", "boltz_get_guidance", "boltz_small_molecule_adme with start=false", "ask for cost confirmation", "boltz_small_molecule_adme with start=true", "boltz_job_status with resource predictions:adme to retrieve inline results"]
  },
  {
    id: "small-molecule-screen",
    skillDir: "boltz-small-molecule-screen",
    title: "Small-molecule screen",
    toolName: "boltz_small_molecule_screen",
    resource: "small-molecule:library-screen",
    prompt: "boltz_small_molecule_screen_workflow",
    summary: "Screen a supplied small-molecule library against a target.",
    references: ["api", "results"],
    sequence: ["boltz_check_setup", "boltz_get_guidance", "boltz_small_molecule_screen with start=false", "ask for cost confirmation", "boltz_small_molecule_screen with start=true"]
  },
  {
    id: "small-molecule-design",
    skillDir: "boltz-small-molecule-design",
    title: "Small-molecule design",
    toolName: "boltz_small_molecule_design",
    resource: "small-molecule:design",
    prompt: "boltz_small_molecule_design_workflow",
    summary: "Generate novel small-molecule binders for a target.",
    references: ["api", "results"],
    sequence: ["boltz_check_setup", "boltz_get_guidance", "boltz_small_molecule_design with start=false", "ask for cost confirmation", "boltz_small_molecule_design with start=true"]
  },
  {
    id: "protein-screen",
    skillDir: "boltz-protein-screen",
    title: "Protein screen",
    toolName: "boltz_protein_screen",
    resource: "protein:library-screen",
    prompt: "boltz_protein_screen_workflow",
    summary: "Screen a supplied protein-family library against a target.",
    references: ["api", "results"],
    sequence: ["boltz_check_setup", "boltz_get_guidance", "boltz_protein_screen with start=false", "ask for cost confirmation", "boltz_protein_screen with start=true"]
  },
  {
    id: "protein-design",
    skillDir: "boltz-protein-design",
    title: "Protein design",
    toolName: "boltz_protein_design",
    resource: "protein:design",
    prompt: "boltz_protein_design_workflow",
    summary: "Generate novel protein binders, including peptides, antibodies, nanobodies, or custom proteins.",
    references: ["api", "results"],
    sequence: ["boltz_check_setup", "boltz_get_guidance", "boltz_protein_design with start=false", "ask for cost confirmation", "boltz_protein_design with start=true"]
  }
];

export const serverInstructions = [
  "Use Boltz tools for molecular structure prediction, binding prediction, ADME property prediction, small-molecule screening/design, and protein screening/design.",
  "Before preparing or calling a paid workflow tool, call boltz_get_guidance for the matching workflow unless equivalent guidance is already visible in the conversation.",
  "For every workflow, check setup/auth first, build a valid Boltz API JSON payload, estimate with start=false, then ask the user before submitting with start=true.",
  "Do not invent missing biological inputs, sequences, ligands, libraries, workspace IDs, or payload fields. Ask for the missing information or explain the assumption before estimating.",
  "Use a stable run_name as the idempotency key and result tracking name. Prefer structured payload JSON; use payload_text only when exact raw JSON is required.",
  "After a job starts, use auto_download when appropriate and use boltz_job_status or boltz_download_results to monitor downloaded results or retrieve inline results."
].join("\n");

const guideById = new Map(workflowGuides.map((guide) => [guide.id, guide]));
const guideByTool = new Map(workflowGuides.map((guide) => [guide.toolName, guide]));

export const guidanceResources = [
  {
    name: "boltz-guides-index",
    uri: "boltz://guides/index",
    title: "Boltz Workflow Guides",
    description: "Index of bundled Boltz workflow guides exposed by this MCPB server.",
    mimeType: "text/markdown",
    read: async (uri) => resourceText(uri, buildGuideIndex())
  },
  ...workflowGuides.map((guide) => ({
    name: `boltz-guide-${guide.id}`,
    uri: `boltz://guides/${guide.id}`,
    title: guide.title,
    description: guide.summary,
    mimeType: "text/markdown",
    read: async (uri) => resourceText(uri, await readSkillText(guide))
  })),
  ...workflowGuides.flatMap((guide) =>
    guide.references.map((reference) => ({
      name: `boltz-reference-${guide.id}-${reference}`,
      uri: `boltz://references/${guide.id}/${reference}`,
      title: `${guide.title} ${reference} reference`,
      description: `Bundled ${reference} reference for ${guide.title}.`,
      mimeType: "text/markdown",
      read: async (uri) => resourceText(uri, await readReferenceText(guide, reference))
    }))
  )
];

export const guidancePrompts = workflowGuides
  .filter((guide) => guide.prompt)
  .map((guide) => ({
    name: guide.prompt,
    title: `${guide.title} workflow`,
    description: `Use the Boltz ${guide.title.toLowerCase()} workflow with setup checks, guidance, cost estimate, confirmation, and result download.`,
    argsSchema: {
      request: z.string().optional().describe("The user's scientific objective, target, library, or constraints."),
      run_name: z.string().optional().describe("Preferred stable run name/idempotency key."),
      workspace_id: z.string().optional().describe("Optional Boltz workspace ID.")
    },
    getMessages: async (args = {}) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: await buildPromptText(guide, args)
          }
        }
      ]
    })
  }));

export async function getGuidance(args = {}) {
  const guide = guideById.get(args.workflow);
  if (!guide) {
    throw new Error(`Unknown Boltz workflow guidance: ${args.workflow}`);
  }

  const topic = args.topic || "overview";
  const documents = await readTopicDocuments(guide, topic);
  return {
    workflow: guide.id,
    title: guide.title,
    summary: guide.summary,
    tool_name: guide.toolName,
    resource: guide.resource,
    topic,
    must_do: [
      "Call boltz_check_setup before workflow tools if setup/auth state is not already known.",
      "Call the workflow tool with start=false first to estimate cost.",
      "Ask the user to confirm the estimate before retrying with start=true.",
      "Use a stable run_name for idempotency and result download resume.",
      "Do not invent missing payload fields or biological inputs."
    ],
    recommended_sequence: guide.sequence,
    available_resources: resourceUrisForGuide(guide),
    documents
  };
}

export function workflowDescription(toolName) {
  const guide = guideByTool.get(toolName);
  if (!guide) return "";
  return [
    `Use for: ${guide.summary}`,
    "Before calling this tool for a new request, call boltz_get_guidance for this workflow unless the guide is already in context.",
    "The first call should normally use start=false to estimate cost. Only call again with start=true after the user confirms the estimate.",
    "The payload must be valid Boltz API JSON for this workflow. Ask for missing target, ligand, sequence, library, or design constraints instead of guessing.",
    "Use run_name as a stable idempotency key and result tracking name."
  ].join(" ");
}

function resourceText(uri, text) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text
      }
    ]
  };
}

function buildGuideIndex() {
  const lines = [
    "# Boltz Workflow Guides",
    "",
    "Use these resources as read-only workflow guidance for the Boltz MCPB tools.",
    ""
  ];
  for (const guide of workflowGuides) {
    lines.push(`- ${guide.title}: boltz://guides/${guide.id}`);
    for (const reference of guide.references) {
      lines.push(`  - ${reference}: boltz://references/${guide.id}/${reference}`);
    }
  }
  return lines.join("\n");
}

async function buildPromptText(guide, args) {
  const guidance = await getGuidance({ workflow: guide.id, topic: "full" });
  const lines = [
    `Use the Boltz ${guide.title} MCPB workflow.`,
    "",
    "Follow these rules:",
    "- Check setup/auth before estimating if not already known.",
    "- Build a valid Boltz API JSON payload for the selected workflow.",
    "- Estimate cost first with start=false.",
    "- Ask the user before submitting a paid job with start=true.",
    "- Use a stable run_name for idempotency and downloads.",
    "- Do not invent missing biological inputs or payload fields.",
    "",
    args.request ? `User request: ${args.request}` : "",
    args.run_name ? `Preferred run_name: ${args.run_name}` : "",
    args.workspace_id ? `Workspace ID: ${args.workspace_id}` : "",
    "",
    "Bundled guidance:",
    JSON.stringify(guidance, null, 2)
  ];
  return lines.filter((line) => line !== "").join("\n");
}

async function readTopicDocuments(guide, topic) {
  if (topic === "overview") {
    return [await readSkillDocument(guide)];
  }
  if (topic === "full") {
    return [
      await readSkillDocument(guide),
      ...(await Promise.all(guide.references.map((reference) => readReferenceDocument(guide, reference))))
    ];
  }
  if (guide.references.includes(topic)) {
    return [await readReferenceDocument(guide, topic)];
  }
  return [await readSkillDocument(guide)];
}

async function readSkillDocument(guide) {
  return {
    uri: `boltz://guides/${guide.id}`,
    title: guide.title,
    mimeType: "text/markdown",
    text: await readSkillText(guide)
  };
}

async function readReferenceDocument(guide, reference) {
  return {
    uri: `boltz://references/${guide.id}/${reference}`,
    title: `${guide.title} ${reference} reference`,
    mimeType: "text/markdown",
    text: await readReferenceText(guide, reference)
  };
}

function resourceUrisForGuide(guide) {
  return [
    `boltz://guides/${guide.id}`,
    ...guide.references.map((reference) => `boltz://references/${guide.id}/${reference}`)
  ];
}

async function readSkillText(guide) {
  return readGuidanceFile(["skills", guide.skillDir, "SKILL.md"], ["skills", "cli", guide.skillDir, "SKILL.md"]);
}

async function readReferenceText(guide, reference) {
  return readGuidanceFile(["references", guide.skillDir, `${reference}.md`], ["references", guide.skillDir, `${reference}.md`]);
}

async function readGuidanceFile(packagedParts, coreParts) {
  const packagedPath = path.join(packagedGuidanceRoot, ...packagedParts);
  if (existsSync(packagedPath)) {
    return readFile(packagedPath, "utf8");
  }

  const corePath = path.join(coreGuidanceRoot, ...coreParts);
  if (existsSync(corePath)) {
    return readFile(corePath, "utf8");
  }

  throw new Error(`Bundled Boltz guidance file is missing: ${packagedParts.join("/")}`);
}
