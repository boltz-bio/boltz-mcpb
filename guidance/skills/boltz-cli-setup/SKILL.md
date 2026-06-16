---
name: boltz-cli-setup
description: Boltz CLI setup and auth. Use when installing, updating, verifying, or authenticating `boltz-api`, or fixing missing CLI, PATH, sandbox, browser login, or auth errors.
---

# Boltz CLI Setup

Use this skill for `boltz-api` installation, version, PATH, and authentication issues. The workflow skills assume `boltz-api` is already installed.

## Verify Installation

Check that the CLI is available:

```sh
boltz-api --version
```

If `boltz-api` is missing or too old, install or update it from the official CLI repo.

macOS and Linux:

```sh
curl -fsSL https://install.boltz.bio/boltz-api/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://install.boltz.bio/boltz-api/install.ps1 | iex
```

The installer updates an existing `boltz-api` on `PATH`. If no binary is found, it installs to a user-local bin directory. Add the installed binary to `PATH` if `boltz-api --version` is still not found after install.

Working around the sandbox is critical because the sandbox can block browser login, OAuth callbacks, temp files, credential storage, and user-wide install paths. If the user asks for a normal install, install or authenticate `boltz-api` in the user's real environment. In a filesystem sandbox, request the host sandbox bypass/escalation needed for the install or auth flow.

Read [references/sandbox.md](references/sandbox.md) when an agent sandbox blocks the installer, browser auto-open, OAuth callback, credential storage, temp files, or global install path.

## Authenticate

Check the current auth state with:

```sh
boltz-api auth status
```

If `auth status` reports unauthenticated, or any Boltz command fails because authentication is missing or expired, start device-code login on the user's behalf before retrying:

```sh
boltz-api auth login --device-code
```

Do not ask the user for permission before starting device-code login; relaying the login URL/code and waiting for the CLI to complete is part of auth recovery. When sharing the authentication login URL/code, tell the user to use exactly `boltz-api auth login --device-code`.

For auth recovery, assume the CLI can auto-open the browser and run the exact command above. In sandboxed environments, request the host sandbox bypass/escalation needed for browser auto-open, OAuth callbacks, credential storage, or temp files.

For automation where a key is already available, an API key is still supported:

```sh
export BOLTZ_API_KEY=<api-key>
```

## Version Checks

Do not hard-code expected commands or minimum versions in this skill. Treat the CLI's own update check as the source of truth.

When `boltz-api` reports that an update is available or required, relay that message and the install command it provides. The CLI may get this from a Boltz-hosted version metadata endpoint such as `/cli/version`, returning latest version, minimum supported version, whether an update is required, and platform-appropriate install instructions.

If a user asks why the CLI thinks it is stale, explain the split:

- GitHub Releases define which CLI binaries are available to install.
- The Boltz version endpoint defines API compatibility, including the minimum supported CLI version.

Respect user or CI opt-outs such as `BOLTZ_API_NO_UPDATE_CHECK=1`; do not force update checks when the environment disables them.
