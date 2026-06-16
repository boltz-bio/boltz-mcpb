---
name: boltz-small-molecule-screen
description: Screen existing small-molecule libraries with Boltz. Use when docking, scoring, or ranking a supplied SMILES or compound library against a target; also returns free Tier-1 ADME/ADMET (solubility, permeability, lipophilicity/logD) per molecule. Not for de novo molecule design, one-off docking, or ADME on bare SMILES with no target (use boltz-small-molecule-adme).
---

## Workflow

If `boltz-api` is missing from `PATH`, use `boltz-cli-setup` for install/update guidance before retrying.
If a command reports missing or expired authentication, use `boltz-cli-setup` to start `boltz-api auth login --device-code` before retrying; do not ask permission first.
If the agent host sandbox blocks `boltz-api` install/auth/API calls, use `boltz-cli-setup` to request the host sandbox bypass/escalation needed for user-wide CLI install, browser login, credential storage, temp files, or API access before retrying.

Use this skill when the user already has candidate molecules.

1. Normalize the library from raw SMILES, a CSV (auto-detect the SMILES column), `.smi`, or `.txt` into the `molecules` list. Each entry is `{smiles, id?}`; the optional `id` is echoed back as `external_id` on each result.
2. Normalize the target: one or more protein sequences into `target.entities`, plus optional `pocket_residues` (0-based) and/or `reference_ligands` (SMILES of known binders to help locate the pocket).
3. Keep default server-side filtering unless the user asks for custom filters — only add `molecule_filters` on explicit request.
4. Author the payload YAML or JSON, run `estimate-cost`, show the user the USD cost, wait for explicit confirmation.
5. `start` to submit (synchronous). Capture the ID.
6. Launch `download-results` with the agent runtime's background/non-blocking command facility — it polls, paginates `list-results`, downloads every per-hit structure, and exits when terminal. In Claude Code, use Bash with `run_in_background: true`. In Codex, run `download-results` as a foreground shell command with `yield_time_ms: 1000`; if Codex returns a `session_id`, keep it for optional later polling. After launching it, report the job ID, run name, and output directory, then end the turn immediately. Do not wait on the background session unless the user explicitly asks for progress.
7. When done, rank from `<output-root>/<run-name>/results/index.jsonl`. Sort by `binding_confidence` for hit discovery or `optimization_score` for lead optimization; these are parallel intents, not a fallback hierarchy. Report the top 5-10 hits with `smiles`, the chosen ranking metric, key confidence metrics, and structure path. Each result also carries a free `adme` block (`solubility`, `permeability`, `lipophilicity`) — include it for developability triage when the user cares about ADME, or when a top hit looks risky. Read [references/results.md](references/results.md) for output layout, metrics, ADME, and filtered-input accounting.

## Command Pattern

```bash
# Replace placeholders with concrete absolute paths before running.
# Use a short descriptive run name, for example: sm-screen-<target>-<library>-v1

boltz-api small-molecule:library-screen estimate-cost \
  --input @yaml:///absolute/path/payload.yaml

boltz-api small-molecule:library-screen start \
       --idempotency-key "<run-name>" \
       --input @yaml:///absolute/path/payload.yaml \
       --raw-output --transform id

# Copy the printed job ID into this command, then launch it in the agent
# runtime's background/non-blocking mode.
# Claude Code: Bash with run_in_background=true.
# Codex: foreground shell command with yield_time_ms=1000; keep the returned session_id if one is provided.
# Do not append "&" or use nohup in Codex.
boltz-api download-results \
  --id "<job-id-from-start>" --name "<run-name>" \
  --root-dir "/absolute/path/boltz-experiments" \
  --poll-interval-seconds 30
# -> /absolute/path/boltz-experiments/<run-name>/results/<pres_*>/...
```

Payload keys are `molecules`, `target`, `molecule_filters` — the API body field names, not the direct CLI flag names `--molecule` / `--target` / `--molecule-filters`.

## Always Do This

- Keep payload field names exactly as the API body names shown in `references/api.md`.
- Use absolute paths for the output root, payload files, and embedded target files. Do not `cd` into the run directory for follow-up commands; pass the same `--root-dir` and use absolute paths so later relative paths do not drift.
- Prefer one merged top-level payload via `--input @yaml:///absolute/path/payload.yaml` or `@json:///absolute/path/payload.json` for `estimate-cost` and `start`. Keep `--idempotency-key` and `--workspace-id` top-level; if they also appear inside `--input`, the top-level flags win.
- Direct object flags still work as overrides, such as `--target @yaml:///absolute/path/target.yaml`, `--molecule-filters @json:///absolute/path/filters.json`, or repeated `--molecule @json:///absolute/path/mol-1.json` entries. Piped YAML / JSON on stdin also works, but it must use API body field names. Never use `@file://` or `@./`.
- Treat pocket residue indices as 0-based.
- Do not invent medicinal-chemistry filters. Only add `molecule_filters` if the user asks; mention the catalog as an option.
- Use the same slug as both `--idempotency-key` at submit and `--name` on `download-results` so re-runs resume via `.boltz-run.json`.
- In permission-gated agents such as Claude Code, keep each Boltz call as a top-level command that starts with `boltz-api`. Prefer concrete arguments over `sh -c`, inline environment assignments, aliases, wrapper scripts, loops, or pipelines around the `boltz-api` invocation unless the user already allowed that exact command form. Use `--raw-output --transform id`, read the printed ID, then paste that literal ID into the next `download-results` command.
- Prefer the agent runtime's background/non-blocking command mode for `download-results`. In Codex specifically, keep `download-results` in the foreground and set the shell tool yield to 1000 ms; Codex will return a `session_id` if the command is still running. Do not append `&` or use `nohup` in Codex because the tool runner may clean up shell-backgrounded descendants before `.boltz-run.json` is fully written.
- After the background/session starts, do not wait on it or poll it. `download-results` emits JSONL progress on stderr by default; add `--progress-format text --verbose` only when you explicitly want human-readable logs. Report the job ID, run name, output directory, and that the runtime should notify when the background command completes.
- Only check status when the user asks. In Codex, poll the saved session with an empty `write_stdin`, or prefer `boltz-api --format json download-status --name "<run-name>" --root-dir "/absolute/path/boltz-experiments"` for structured local checkpoint state. Never run a manual poll loop.
- If detached download needs to be restarted, re-run `boltz-api download-results` with the same `--name "<run-name>"` and the same `--root-dir`.
- Cost is a flat $0.025 per molecule (size-independent). `estimate-cost` returns the authoritative total — always use it.
- Poll interval: `--poll-interval-seconds 30` is a reasonable default. Wall-clock time scales roughly with the number of molecules — ~100 or fewer usually finish in a few minutes, while thousands can take hours (exact time depends on the inputs and overall system load); don't quote a fixed duration.

## Escape Hatch

- Payload reference: <https://api.boltz.bio/docs/api/python/resources/small_molecule/subresources/library_screen/methods/start>
- CLI flag names: `boltz-api small-molecule:library-screen start --help`

Read [references/api.md](references/api.md) for the `molecules`, `target`, and `molecule_filters` shapes, including the built-in SMARTS filters and RDKit descriptor ranges. Read [references/results.md](references/results.md) after download when ranking hits or explaining missing/filtered inputs.

## Outputs

Rank from `results/index.jsonl` after `download-results`; use [references/results.md](references/results.md) for the local file layout, metric meanings, and filtered-input accounting.
