# Protein Design Results

Read this after `download-results` completes, when ranking designed protein results or summarizing output files.

## Local Layout

Under `<output-root>/<run-name>/`:

- `.boltz-run.json`
- `run.json` - sanitized remote run record
- `results/index.jsonl` - one generated design per line, with sequence, metrics, and local paths
- `results/<pres_*>/metadata.json` - per-result metadata copied from list-results
- `results/<pres_*>/archive.tar.gz`
- extracted result files such as predicted complex structure and metrics

## Ranking

For binder runs, rank by `binding_confidence` descending. Use `iptm` (higher is better) and `min_interaction_pae` (lower is better) as tiebreakers. Generic runs omit binding-specific metrics; rank them by `structure_confidence` and inspect the secondary-structure fractions. Fusion results contain only the parent `output_chain_id` in the fused entity.

`optimization_score` is not emitted for `protein:design`; do not sort by it.

## Generated Binder Entity

The generated binder entity comes back as `type: "protein"` rather than `type: "designed_protein"`, with the sequence DSL resolved to a real amino-acid sequence in `value`. Select the binder by `chain_ids` (the ID assigned at submit time), not by `type == "designed_protein"`.
