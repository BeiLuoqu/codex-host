/** Native Renderer services are exported by Desktop's preloaded ES modules. */
export interface CodexSshServices {
  sshConnections: {
    refresh(): Promise<unknown>;
    save(params: unknown): Promise<unknown>;
  };
  remoteConnections: {
    setAutoConnect(params: unknown): Promise<unknown>;
    getState(hostId: string): Promise<unknown>;
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isSshServices(value: unknown): value is CodexSshServices {
  if (
    !record(value) ||
    !Object.hasOwn(value, "sshConnections") ||
    !Object.hasOwn(value, "remoteConnections")
  )
    return false;
  const ssh = value.sshConnections;
  const remote = value.remoteConnections;
  // Native RPC stubs are callable proxies, so they need not be plain objects.
  return (
    ssh != null &&
    remote != null &&
    typeof (ssh as CodexSshServices["sshConnections"]).refresh === "function" &&
    typeof (ssh as CodexSshServices["sshConnections"]).save === "function" &&
    typeof (remote as CodexSshServices["remoteConnections"]).getState === "function" &&
    typeof (remote as CodexSshServices["remoteConnections"]).setAutoConnect === "function"
  );
}

export async function loadCodexSshServices(
  ownerWindow: Window,
  importModule: (url: string) => Promise<Record<string, unknown>> = (url) => import(url),
): Promise<CodexSshServices | null> {
  if (!ownerWindow.document || !ownerWindow.location) return null;
  const page = new URL(ownerWindow.location.href);
  const urls = new Set<string>();
  for (const link of ownerWindow.document.querySelectorAll('link[rel="modulepreload"][href]')) {
    const url = new URL(link.getAttribute("href") ?? "", page);
    if (
      url.protocol === page.protocol &&
      url.host === page.host &&
      url.pathname.endsWith(".js") &&
      !url.search &&
      !url.hash
    )
      urls.add(url.href);
  }
  // Prioritize the shared chunk, but validate exports and allow the service to move.
  const candidates = [...urls].sort(
    (a, b) => Number(b.includes("/app-shared-")) - Number(a.includes("/app-shared-")),
  );
  for (const url of candidates) {
    let module: Record<string, unknown>;
    try {
      module = await importModule(url);
    } catch {
      continue;
    }
    const matches = new Set(Object.values(module).filter(isSshServices));
    if (matches.size > 1) throw new Error("Codex SSH settings are unavailable in this window");
    if (matches.size === 1) return [...matches][0] ?? null;
  }
  return null;
}
