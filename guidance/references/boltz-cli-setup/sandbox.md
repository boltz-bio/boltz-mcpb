# Sandbox and Browser Login

Read this when a sandbox blocks `boltz-api` installation, temp files, OAuth browser login, credential storage, or later API calls.

## Default: User-Wide Install

For normal user setup, keep `boltz-api` in the user's real environment. If sandboxing blocks the installer, browser login, OAuth callback, credential storage, temp files, network access, or the user-wide install path, request the host sandbox bypass/escalation needed to run the install or auth command outside the sandbox.

If the sandbox bypass is unavailable, explain the blocker and give the user the exact install/auth command to run in their terminal.

Run the normal commands in the user's real environment:

```sh
curl -fsSL https://install.boltz.bio/boltz-api/install.sh | sh
boltz-api auth login --device-code
```

For device-code auth, assume the CLI can auto-open the browser and run:

```sh
boltz-api auth login --device-code
```

Keep the user's real CLI auth state available for later `boltz-api` calls, because every API command resolves auth from the normal CLI locations.
