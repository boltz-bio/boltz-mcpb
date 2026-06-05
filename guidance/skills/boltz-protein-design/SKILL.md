---
name: boltz-protein-design
description: Design new protein binders with Boltz. Use when generating protein, peptide, antibody, nanobody, or custom binder candidates for a target. Not for screening existing proteins or small molecules.
---

## Workflow

If `boltz-api` is missing from `PATH`, use `boltz-cli-setup` for install/update guidance before retrying.
If a command reports missing or expired authentication, use `boltz-cli-setup` to start `boltz-api auth login --device-code` before retrying; do not ask permission first.
If the agent host sandbox blocks `boltz-api` install/auth/API calls, use `boltz-cli-setup` to request the host sandbox bypass/escalation needed for user-wide CLI install, browser login, credential storage, temp files, or API access before retrying.

Use this skill when the user wants de novo protein / peptide / antibody / nanobody binders.

1. Normalize the target (same shape as protein-screen): `structure_template` if a CIF/PDB is available, else `no_template`.
2. Pick the `binder_specification` variant. Supported variants include:
   - `boltz_curated` — recommended default for antibody and nanobody design. Boltz selects from maintained scaffold/template lists (`binder: boltz_antibody` or `boltz_nanobody`).
   - `structure_template` — redesign motifs in an existing binder scaffold (CIF + `design_motifs` with `replacement` / `insertion` segments).
   - `no_template` — generate from the sequence DSL (fixed residues + designed segments like `5..10` or `8`).
3. For antibody or nanobody requests, ask before authoring the payload: "I recommend Boltz's curated antibody/nanobody scaffolds for this. Do you want the curated default, or do you have custom scaffold structures/CDR motifs to use?" If the user picks curated, use `type: boltz_curated`; if they want custom scaffold control, use `type: structure_template`.
4. Pick `modality`: `peptide`, `antibody`, `nanobody`, or `custom_protein` for `structure_template` and `no_template`. Do not include `modality` on `boltz_curated`; use `binder` instead.
5. Pick `num_proteins` — minimum **10**, server rejects lower. If the user says a smaller number, explain the floor and propose 10.
6. Supported optional features include rules such as excluded amino acids, excluded sequence motifs with `X` wildcards, and max hydrophobic fraction. Add `rules` only on request; read [references/api.md](references/api.md) for exact shapes and examples.
7. Author the payload YAML or JSON, run `estimate-cost`, show the USD cost, wait for explicit confirmation. **Cost scales with total complex length** (target + binder), not just `num_proteins`. A small peptide + small target runs ≈$0.025 per design; larger complexes (e.g. GFP + 20-mer binder) run ≈$0.05 per design. Always quote the exact figure from `estimate-cost`.
8. `start` to submit. Capture the ID.
9. Launch `download-results` with the agent runtime's background/non-blocking command facility. In Claude Code, use Bash with `run_in_background: true`. In Codex, run `download-results` as a foreground shell command with `yield_time_ms: 1000`; if Codex returns a `session_id`, keep it for optional later polling. After launching it, report the job ID, run name, and output directory, then end the turn immediately. Do not wait on the background session unless the user explicitly asks for progress.
10. Rank from `<output-root>/<run-name>/results/index.jsonl` by `binding_confidence` descending. Use `iptm` and `min_interaction_pae` as tiebreakers. `optimization_score` is not emitted for this endpoint. Read [references/results.md](references/results.md) for output layout and metric details.

## Command Pattern

```bash
# Replace placeholders with concrete absolute paths before running.
# Use a short descriptive run name, for example: protein-design-<modality>-<target>-v1

boltz-api protein:design estimate-cost \
  --input @yaml:///absolute/path/payload.yaml

boltz-api protein:design start \
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
  --poll-interval-seconds 60
```

Payload keys are `num_proteins`, `target`, `binder_specification` — API body field names.

## Always Do This

- Enforce `num_proteins >= 10` before calling `estimate-cost`. Server rejects anything lower.
- Cost scales with total complex length (target + binder). Always quote `estimated_cost_usd` from `estimate-cost`. 
- For antibody or nanobody design, recommend `binder_specification.type: boltz_curated` and ask the user to confirm they do not want custom scaffold/CDR control before building the payload. Use `binder: boltz_antibody` for antibody/Fab requests and `binder: boltz_nanobody` for nanobody/VHH requests.
- Residue indices are 0-based everywhere (`design_motifs.start_index`/`end_index`, `after_residue_index`, `epitope_residues`, `flexible_residues`, bonds, constraints).
- For CIF/PDB bytes, use `@data:///abs/path/file.cif` inside `structure.data`. Don't use bare `@path`.
- Sequence DSL for `designed_protein.value`: uppercase letters = fixed residues; integer `N` = exactly `N` designed residues; `MIN..MAX` = variable-length designed segment. Examples: `"20"`, `"5..10"`, `"ACDE8GHI"`, `"MKTAYI5..10VKSHFSRQ"`.
- Keep payload field names exactly as the API body names shown in `references/api.md`.
- Use absolute paths for the output root, payload files, and embedded target files. Do not `cd` into the run directory for follow-up commands; pass the same `--root-dir` and use absolute paths so later relative paths do not drift.
- Prefer one merged top-level payload via `--input @yaml:///absolute/path/payload.yaml` or `@json:///absolute/path/payload.json` for `estimate-cost` and `start`. Keep `--idempotency-key` and `--workspace-id` top-level; if they also appear inside `--input`, the top-level flags win.
- Direct object flags still work as overrides, such as `--target @yaml:///absolute/path/target.yaml` or `--binder-specification @json:///absolute/path/binder.json`. Piped YAML / JSON on stdin also works, but it must use API body field names. Use the same slug for both `--idempotency-key` and `--name`.
- In permission-gated agents such as Claude Code, keep each Boltz call as a top-level command that starts with `boltz-api`. Prefer concrete arguments over `sh -c`, inline environment assignments, aliases, wrapper scripts, loops, or pipelines around the `boltz-api` invocation unless the user already allowed that exact command form. Use `--raw-output --transform id`, read the printed ID, then paste that literal ID into the next `download-results` command.
- Prefer the agent runtime's background/non-blocking command mode for `download-results`. In Codex specifically, keep `download-results` in the foreground and set the shell tool yield to 1000 ms; Codex will return a `session_id` if the command is still running. Do not append `&` or use `nohup` in Codex because the tool runner may clean up shell-backgrounded descendants before `.boltz-run.json` is fully written.
- After the background/session starts, do not wait on it or poll it. Design jobs can take 30 min to several hours — `--poll-interval-seconds 60` is a sensible default. `download-results` emits JSONL progress on stderr by default; add `--progress-format text --verbose` only when you explicitly want human-readable logs. Report the job ID, run name, output directory, and that the runtime should notify when the background command completes.
- Only check status when the user asks. In Codex, poll the saved session with an empty `write_stdin`, or prefer `boltz-api --format json download-status --name "<run-name>" --root-dir "/absolute/path/boltz-experiments"` for structured local checkpoint state. Never run a manual poll loop.
- If detached download needs to be restarted, re-run `boltz-api download-results` with the same `--name "<run-name>"` and the same `--root-dir`.
- Only add `rules` on explicit user request.

## Escape Hatch

- Payload reference: <https://api.boltz.bio/docs/api/resources/protein/subresources/design/methods/start/>
- CLI flag names: `boltz-api protein:design start --help`

Read [references/api.md](references/api.md) for all `binder_specification` variants, motif shapes, sequence DSL, rules, modalities, and `target` variants. Read [references/results.md](references/results.md) after download when ranking designed binders or explaining outputs.

## Outputs

Rank from `results/index.jsonl` after `download-results`; use [references/results.md](references/results.md) for local file layout, metric meanings, and the designed-binder entity type gotcha.
