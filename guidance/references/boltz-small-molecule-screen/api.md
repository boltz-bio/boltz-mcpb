# Small Molecule Screen — Payload Reference

Covers the `small-molecule:library-screen` endpoint. Prefer a single merged top-level `--input` payload for `estimate-cost` / `start`. Field names below are **API body field names**, not CLI flag names.

Minimal CLI pattern:

```bash
boltz-api small-molecule:library-screen estimate-cost --input @yaml:///absolute/path/payload.yaml
boltz-api small-molecule:library-screen start --idempotency-key "<run-name>" --input @yaml:///absolute/path/payload.yaml --raw-output --transform id
```

In permission-gated agents, keep the submit command as a top-level `boltz-api ... start` invocation. Read the printed job ID from stdout and paste it into the later `download-results` command.

Keep `--idempotency-key` and `--workspace-id` top-level; if they also appear inside `--input`, the top-level flags win. Direct object flags still work as overrides, such as `--target @yaml:///absolute/path/target.yaml`, `--molecule-filters @json:///absolute/path/filters.json`, or repeated `--molecule @json:///absolute/path/mol-1.json` entries. Piped YAML / JSON on stdin remains supported when you need it, but the body must use API field names.

## Contents

- [Top-level request](#top-level-request)
- [`molecules`](#molecules)
- [`target`](#target)
- [`molecule_filters`](#molecule_filters)
- [Cost](#cost)
- [Outputs (after `download-results`)](#outputs-after-download-results)
- [Escape hatch](#escape-hatch)

## Top-level request

```yaml
# payload.yaml
molecules:
  - smiles: "CCO"
    id: compound-1
  - smiles: "CCN"
    id: compound-2
target:
  entities:
    - type: protein
      chain_ids: [A]
      value: MKTAYIAKQRQISFVKSHFSRQ
  pocket_residues:
    A: [42, 43, 44]         # 0-based
  reference_ligands:
    - "CC(=O)Oc1ccccc1C(=O)O"
molecule_filters:
  boltz_smarts_catalog_filter_level: recommended
```

Top-level fields:

- `molecules` (required) — list of candidate molecules.
- `target` (required) — protein target, pocket info.
- `molecule_filters` (optional) — pre-screen filtering. Omit to use server defaults.

Also passed as separate `start` flags:

- `--idempotency-key <slug>`
- `--workspace-id <id>` (admin keys only)

## `molecules`

```yaml
molecules:
  - smiles: "CCO"
    id: compound-1      # optional, echoed back as external_id on each result
  - smiles: "CCN"
```

Fields:

- `smiles` (required) — SMILES string.
- `id` (optional) — client-supplied identifier; surfaces as `external_id` per result.

## `target`

Only `protein` entities are supported in the screen target.

```yaml
target:
  entities:
    - type: protein
      chain_ids: [A]
      value: MKTAYIAKQRQISFVKSHFSRQ
      cyclic: false       # optional
      modifications: []   # optional; defaults to []
  pocket_residues:
    A: [42, 43, 44]
  reference_ligands:
    - "CC(=O)Oc1ccccc1C(=O)O"
```

Entity fields:

- `type: protein` (required)
- `chain_ids` (required)
- `value` (required) — amino acid sequence in one-letter codes
- `modifications` (optional; see below)
- `cyclic` (optional, bool)

Optional target fields:

- `pocket_residues` — `{chain_id: [residue_index, ...]}`. **0-based indices.** Narrows where ligands are docked.
- `reference_ligands` — list of SMILES strings (known binders) to seed pocket detection if `pocket_residues` isn't provided.

### Polymer modifications

```yaml
modifications:
  - residue_index: 12      # 0-based
    type: ccd
    value: MSE
  # or
  - residue_index: 12
    type: smiles
    value: "C1=CC=CC=C1..."
```

## `molecule_filters`

Optional. Molecules failing any filter are skipped before scoring (so you don't pay for them — verify with `estimate-cost` if filters are aggressive).

Top-level filter fields:

- `boltz_smarts_catalog_filter_level` — built-in catalog. Values: `"recommended"` (default), `"extra"`, `"aggressive"`, `"disabled"`.
- `custom_filters` — list of user filters, AND-combined (a molecule is rejected if any filter rejects it).

Filtering happens before scoring and can reduce the result count. The local `.boltz-run.json` checkpoint and `download-status` do not currently report how many submitted molecules were dropped by the default recommended SMARTS catalog; after `download-results`, check `run.json` for `progress.rejection_summary` when present. Use `results/index.jsonl` as the authoritative local scored-molecule list after download, or `list-results` when no local manifest is available.

### `lipinski_filter`

```yaml
custom_filters:
  - type: lipinski_filter
    max_mw: 500
    max_logp: 5
    max_hbd: 5
    max_hba: 10
    allow_single_violation: true   # optional
```

### `rdkit_descriptor_filter`

```yaml
custom_filters:
  - type: rdkit_descriptor_filter
    mol_wt: {min: 250, max: 550}
    mol_logp: {min: 1, max: 5}
    num_h_donors: {max: 5}
    num_h_acceptors: {max: 10}
    num_rotatable_bonds: {max: 10}
    num_rings: {min: 1, max: 6}
    num_aromatic_rings: {max: 3}
    num_heteroatoms: {min: 1, max: 15}
    fraction_csp3: {min: 0.2, max: 1.0}
    tpsa: {min: 20, max: 140}
```

Supported descriptor keys: `mol_wt`, `mol_logp`, `num_h_donors`, `num_h_acceptors`, `num_rotatable_bonds`, `num_rings`, `num_aromatic_rings`, `num_heteroatoms`, `fraction_csp3`, `tpsa`. Each takes a range object with optional `min` and/or `max`.

### `smarts_catalog_filter`

```yaml
custom_filters:
  - type: smarts_catalog_filter
    catalog: PAINS
```

Allowed catalog names: `PAINS`, `PAINS_A`, `PAINS_B`, `PAINS_C`, `BRENK`, `CHEMBL`, `CHEMBL_BMS`, `CHEMBL_Dundee`, `CHEMBL_Glaxo`, `CHEMBL_Inpharmatica`, `CHEMBL_LINT`, `CHEMBL_MLSMR`, `CHEMBL_SureChEMBL`, `NIH`.

### `smarts_custom_filter`

```yaml
custom_filters:
  - type: smarts_custom_filter
    patterns:
      - "[N+](=O)[O-]"
      - "c1ccc2ccccc2c1"
```

Any molecule matching any pattern is rejected.

### `smiles_regex_filter`

```yaml
custom_filters:
  - type: smiles_regex_filter
    patterns: ["Cl", "Br"]
```

Any molecule whose SMILES matches any regex is rejected.

## Cost

Cost is quoted by `estimate-cost` on the exact payload. For small targets it is typically around $0.025 per submitted molecule, but filters applied pre-scoring can reduce the scored count and pricing can change; always report `estimated_cost_usd` from the response.

## Outputs (after `download-results`)

Under `<output-root>/<run-name>/`:

- `.boltz-run.json`
- `run.json` — sanitized remote run record, including `progress.rejection_summary` when the server returned it
- `results/index.jsonl` — one scored molecule per line, copied from list-results metadata plus local artifact paths
- `results/<pres_*>/metadata.json` — per-result metadata copied from the list-results record
- `results/<pres_*>/archive.tar.gz` — one dir per scored molecule
- `results/<pres_*>/files/result/{metrics.json, predicted_structure.cif, pae.npz}`

Per-result fields (available in `results/index.jsonl`, `results/<pres_*>/metadata.json`, and the `list-results` stream):

- `id` — server-assigned `pres_*` ID
- `external_id` — your input `id`
- `smiles` — the scored SMILES
- `metrics.binding_confidence` — primary for hit discovery
- `metrics.optimization_score` — binding-strength ranking for lead optimization
- `metrics.structure_confidence`
- `metrics.complex_plddt`, `metrics.complex_iplddt`
- `metrics.iptm`, `metrics.ptm`
- `artifacts.structure.url`, `artifacts.archive.url` (presigned, short-lived)
- `warnings` — any server warnings for this molecule

`binding_confidence` and `optimization_score` are parallel intents, not a primary/fallback hierarchy: `binding_confidence` is the primary metric for **hit discovery** (find any binder); `optimization_score` ranks by **binding strength** for **lead optimization**. Both are always present on sm:library-screen results. Sort by whichever matches the user's goal.

For downloaded per-hit directories, do not rely on `files/result/metrics.json` to map back to the input library: those files are engine metrics only. Use `results/index.jsonl` or `results/<pres_*>/metadata.json` for ranked reporting because they contain `external_id`, `smiles`, metrics, and local artifact paths together. Use `boltz-api small-molecule:library-screen list-results --id "<job-id>" --format jsonl` only when the local manifest is missing or stale.

## Escape hatch

- <https://api.boltz.bio/docs/api/python/resources/small_molecule/subresources/library_screen/methods/start>
- `boltz-api small-molecule:library-screen start --help`
