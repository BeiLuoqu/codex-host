/** In-process fixture for the shared isolated-session engine; not a Web server entry. */
import { IsolatedSessions } from "@codexhost/session-runtime";
import type { SessionDataStore } from "@codexhost/session-runtime";
import type { HarnessRegistry } from "./harnesses.ts";
import { bridgeSessionInteraction } from "../../src/sessions.ts";
import { type EventHub, type RpcRegistry, type StreamRegistry } from "../../src/transport.ts";
import type { Workspaces } from "../../src/workspaces.ts";
export type { SessionNotification } from "@codexhost/session-runtime";

export class Sessions extends IsolatedSessions {
  constructor(
    data: SessionDataStore,
    harnesses: HarnessRegistry,
    workspaces: Workspaces,
    events: EventHub,
  ) {
    super(data, harnesses, workspaces, {
      changed: (kind, ...args) => events.emit(kind, ...args),
      interaction: (id, value) => bridgeSessionInteraction(events, id, value),
    });
  }

  register(rpc: RpcRegistry, streams: StreamRegistry): void {
    rpc.register("session/list", () => this.list());
    rpc.register("session/create", (args) => this.createRequest(args));
    rpc.register("session/modelCatalog", () => this.modelCatalog());
    rpc.register("session/selectModel", (args) => this.selectModel(args));
    rpc.register("session/prompt", (args) => this.prompt(args));
    rpc.register("session/cancel", (args) => this.cancel(args));
    rpc.register("session/updateQueue", (args) => this.updateQueue(args));
    rpc.register("session/rename", (args) => this.rename(args));
    rpc.register("session/fork", (args) => this.forkRequest(args));
    rpc.register("session/search", (args) => this.search(args));
    rpc.register("session/page", (args) => this.page(args));
    rpc.register("session/projections", (args) => this.projections(args));
    streams.register("session/follow", (args, sink) => this.follow(args, sink));
    streams.register("session/control", (args, sink) => this.control(args, sink));
  }

  registerImport(rpc: RpcRegistry): void {
    rpc.register("codexhost/importSources", () => this.importSources());
    rpc.register("codexhost/importCandidates", (args) => this.importCandidatesRequest(args));
    rpc.register("codexhost/import", (args) => this.importNativeRequest(args));
  }

  registerCommands(rpc: RpcRegistry): void {
    rpc.register("commands/list", (args) => this.commandsList(args));
    rpc.register("commands/execute", (args) => this.commandsExecute(args));
    rpc.register("permissionPresets/catalog", (args) => this.permissionCatalogRequest(args));
  }
}
