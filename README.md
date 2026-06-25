# Boltz Desktop Extension

The Boltz Model Context Protocol (MCP) server, packaged as a Claude Desktop
extension. Predict protein structures and ligand binding, screen
small-molecule and protein libraries, and design novel binders — all from a
natural-language conversation in Claude Desktop.

## Install

1. Download the latest `boltz-<version>.mcpb` from
   [Releases](https://github.com/boltz-bio/boltz-mcpb/releases).
2. In Claude Desktop, open **Settings → Extensions → Advanced settings →
   Install Extension** and select the downloaded file.
3. Run `boltz_check_setup` from a Claude conversation to verify access and
   sign in.

Requires Claude Desktop ≥ 0.10.0 on macOS or Windows. Node.js ships with
Claude Desktop, so no separate runtime is needed.

## Tools

- `boltz_check_setup` — verify access, sign-in, and output configuration.
- `boltz_install_cli` — install or update the local Boltz components.
- `boltz_auth_login` — start Boltz sign-in via a Boltz-owned auth link.
- `boltz_structure_and_binding` — estimate and optionally start a
  structure-and-binding job, then optionally download results.
- `boltz_small_molecule_adme` — estimate and optionally start an ADME
  prediction, then retrieve inline results.
- `boltz_small_molecule_screen` — small-molecule library screen.
- `boltz_small_molecule_design` — small-molecule design.
- `boltz_protein_screen` — protein-family screen.
- `boltz_protein_design` — protein design.
- `boltz_download_results` — start or resume downloading results for an
  existing job.
- `boltz_job_status` — check job progress, local download state, or recent
  downloader activity.

Read-only tools run without per-call confirmation; tools that modify state
prompt before running.

## Configuration

By default, results download to `~/boltz-experiments`. Override by setting
`BOLTZ_MCPB_OUTPUT_ROOT` in the extension's environment.

## Privacy

Boltz's privacy policy: https://boltz.bio/privacy

This extension stores local setup, sign-in, and result-download state on
your machine. Workflow inputs, job metadata, and downloaded result
artifacts are sent to and retrieved from Boltz services when you run
workflow tools. The extension does not collect Claude conversations beyond
the tool inputs needed to run the requested workflow.

## Support

- Issues and feature requests:
  [github.com/boltz-bio/boltz-mcpb/issues](https://github.com/boltz-bio/boltz-mcpb/issues)
- Documentation: https://api.boltz.bio/docs

## Development

This repository hosts the released extension. Runtime assets
(`manifest.json`, `package.json`, `server/`, `test/`, `examples/`, `icon.png`)
are mirrored from an upstream monorepo on each release; `README.md`,
`LICENSE`, and `.github/` are maintained directly here.

To build a `.mcpb` bundle from a checkout:

```sh
npm install
npm test
npm install --production
npx @anthropic-ai/mcpb pack
```

## License

[MIT](LICENSE)
