# Web Codex Adapter

The imported Web Codex Adapter runs an independent native `codex app-server` over stdio. It uses short-lived model inspection processes, a shared read-only history connection, and a separate app-server process per active native session, translating messages, tools and interactions into the Harness events consumed by the Web Host.

This package is not in the Desktop preinstalled plugin set. It neither replaces the official Codex forwarding path nor connects to a running Desktop Host. The Web packer builds its plugin from this workspace; there is no second implementation inside Web Server.

The source `npm start web` entry enables the packaged Codex and external Harnesses by default. Low-level Web startup can select it explicitly with `--harness codex --codex-command /absolute/path/to/codex`, or combine it with external Harness IDs. The shared Host's external `enabled.json` never grants the GUI access to this execution plugin.

The shared Host supplies `CODEXHOST_CODEX_COMMAND` and `CODEXHOST_CODEX_HOME` to the factory. The command must be an absolute native CLI path; known CodexHost shim/proxy paths and the inherited Desktop CLI override are rejected. Web selects `--codex-home`, then the inherited `CODEX_HOME`, then `~/.codex`. The plugin can also use the local defaults when no home override is supplied. Sharing the GUI home is allowed: the native CLI reads existing credentials and configuration directly. The Host does not copy credentials or create a separate authentication store.

All model inspection, history, create and resume calls use the selected native home. Native references include its canonical path in `locator.codexHome`; create and explicit import both issue this binding. Resume and history reads reject references from another home or legacy references without the binding before starting a native process. Changing `--codex-home` therefore cannot silently resume previously saved references in another execution environment. Child processes receive no `CODEXHOST_*`, `CODEX_CLI_PATH`, inherited Thread identity or Node injection environment. Missing resume references fail instead of creating another session.

The shared Host owns the fixed Web source; Web gateways are clients and may reconnect independently. Standalone execution is disabled. Sharing a home does not route GUI requests through the plugin or coordinate concurrent writers to the same Native Session. Normal creation starts a new native Thread; existing native history is only adopted through explicit import. Fork and rollback remain unsupported. Existing Host configurations and home-bound references are not migrated; older deployments can keep `--codex-home <web-data>/codex-home` explicitly.

The implementation originates in the MIT-licensed codexhost-web fork; the original license is retained in `LICENSE.upstream`.

## Local native authentication

Authentication is owned by the native CLI. Inspection reads the model catalog without `account/read`, login calls or inference probes; Session creation has no authentication preflight. A readable model catalog is not evidence of valid credentials or quota. Native failures retain their error messages and use the ordinary Harness failure path. There is no authentication state, invalidation callback or special queue pause; queued messages follow the existing general rules after a failed Turn.

Model inspections for the same cwd share an in-flight request and close their native process afterward. Read-only control requests have a 15-second timeout. The Host does not promise hot credential reload, automatically restart tasks or replay failed messages. Desktop routing and Node injection environment variables are removed from plugin processes even when the native home is shared.

The plugin implements the public `HarnessAdapter` / `HarnessSession` contracts. Existing native same-turn input is exposed through optional `steer`, and persisted history through optional `readHistory`; these do not add new Web features. A failed native steer is returned as an error, never converted into cancel-and-replay. Session runtime uses these public contracts, while the fixed Web scope is loaded through the shared Loader and Registry with server-owned explicit enablement. External scope still excludes Codex before importing code.
