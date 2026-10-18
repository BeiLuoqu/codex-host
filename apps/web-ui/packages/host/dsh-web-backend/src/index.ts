/**
 * Host-side DSH backend for the CodexHost Web right Sidebar.
 *
 * The Web server owns the HTTP listener, authentication, and the WebSocket mux.
 * This module mounts the DSH services those routes forward to: the Typert
 * registry, the local filesystem, DSH Connection, the Typert gateway, and the
 * workspace file service. Only the two seams DSH lacks here are supplied:
 * a local Thread's working directory and the sandbox policy's workspace root.
 */
import { Context } from "@deepseek-ai/cordis";
import TypertGateway from "@deepseek-ai/dsh-api-gateway";
import WorkspaceFiles from "@deepseek-ai/dsh-api-workspace-files";
// The Connection plugin root mounts browser authentication, which the Web
// server already provides; only the Host RPC service is needed here.
import { HostConnectionService } from "@deepseek-ai/dsh-client-connection/src/rpc-host.ts";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import type { SandboxPolicyService } from "@deepseek-ai/dsh-sandbox-policy";
import TypertRegistry from "@deepseek-ai/dsh-typert-registry";

/** Remote namespaces this context mounts; every other `/api` route stays with Web. */
const NAMESPACES = ["workspaceFiles"];

/** A fresh uplink nobody sends on: these DSH methods read no Client items. */
function emptyUplink(): AsyncIterable<unknown> {
  return (async function* () {})();
}

/** One Session header as the DSH file lookup reads it. */
function sessionHeader(sessionId, cwd) {
  return { id: sessionId, header: { cwd } };
}

/**
 * Mount the DSH backend for the right Sidebar.
 * @param options - local Thread lookup and fallback workspace root.
 * @returns the embedded backend.
 */
export async function createDshWebBackend(options) {
  const ctx = new Context();
  try {
    await ctx.plugin(TypertRegistry);
    await ctx.plugin(LocalFileSystem, { cwd: options.workspaceRoot });
    // DSH resolves a Session header from its own session service. Web already
    // owns Thread identity, so this seam answers from the Host-recorded local
    // working directory and returns nothing for every other Thread.
    ctx.provide("sessions", {
      get(sessionId) {
        const cwd = options.threadWorkspace(sessionId);
        return cwd === undefined ? undefined : sessionHeader(sessionId, cwd);
      },
    });
    // The sandbox-policy seam reads only this root when no Session cwd applies.
    const sandboxPolicy: Pick<SandboxPolicyService, "workspaceRoot"> = {
      workspaceRoot: options.workspaceRoot,
    };
    ctx.provide("sandboxPolicy", sandboxPolicy);
    // Web authenticates every request before forwarding it, so Connection is
    // mounted for its shared Fetch handler and Peer, not for its own auth.
    await ctx.plugin((scope) => {
      new HostConnectionService(scope, [], {});
    });
    await ctx.plugin(TypertGateway);
    await ctx.plugin(WorkspaceFiles);
  } catch (error) {
    await ctx.fiber.dispose().catch(() => undefined);
    throw error;
  }
  const connection = ctx.get("connection");
  const gateway = ctx.get("typertGateway");
  if (connection === undefined || gateway === undefined) {
    await ctx.fiber.dispose();
    throw new Error("dsh-web-backend: the gateway mounted without a Connection service");
  }
  const handler = connection.createSharedFetchHandler("/api");
  return {
    handles: (endpoint) => NAMESPACES.some((name) => endpoint.startsWith(`${name}/`)),
    fetch: (request) => handler.fetch(request),
    openStream: (endpoint, args, signal) =>
      gateway.wireStream.open(endpoint, { args }, emptyUplink(), undefined, signal),
    failure: (error) => gateway.wireStream.failure(error),
    close: async () => {
      await ctx.fiber.dispose();
    },
  };
}
