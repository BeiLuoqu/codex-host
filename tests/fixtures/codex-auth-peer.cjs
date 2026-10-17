/** Synthetic Codex native local credentials and Thread protocol; no login or network. */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
if (process.argv.includes("--version")) process.exit(0);
const home = process.env.CODEX_HOME;
const file = (name) => path.join(home, name);
fs.mkdirSync(home, { recursive: true });
const read = (name, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return fallback;
  }
};
const write = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value));
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const notify = (method, params) => send({ method, params });
let turn = 0;
let threadId = "";
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  fs.appendFileSync(
    file("rpc.jsonl"),
    JSON.stringify({ method: request.method, pid: process.pid, params: request.params }) + "\n",
  );
  if (request.id === undefined) return;
  const config = read("scenario.json", {});
  let result = {};
  if (request.method === "model/list")
    result = {
      data: [
        {
          id: "test-model",
          displayName: "Test",
          description: "",
          hidden: false,
          isDefault: true,
          supportedReasoningEfforts: [],
          defaultReasoningEffort: "medium",
        },
      ],
    };
  if (request.method === "model/list" && config.modelWaitFile) {
    const waiting = setInterval(() => {
      if (!fs.existsSync(file(config.modelWaitFile))) return;
      clearInterval(waiting);
      send({ id: request.id, result });
    }, 10);
    return;
  }
  if (request.method === "thread/start" || request.method === "thread/resume") {
    threadId =
      request.method === "thread/start" ? `native-${process.pid}` : request.params.threadId;
    result = { thread: { id: threadId }, model: "test-model", reasoningEffort: null };
  }
  if (request.method === "turn/steer" && config.steerReject) {
    send({
      id: request.id,
      error: {
        code: -32000,
        message: "cannot steer",
        ...(config.steerUnauthorized ? { data: { codexErrorInfo: "unauthorized" } } : {}),
      },
    });
    return;
  }
  if (request.method === "thread/read") result = { thread: { turns: read("turns.json", []) } };
  if (request.method === "thread/list") result = { data: [] };
  if (request.method === "turn/start") {
    const id = "turn-" + process.pid + "-" + ++turn;
    const text = request.params.input.map((part) => part.text ?? "").join("");
    send({ id: request.id, result: { turn: { id } } });
    notify("turn/started", { threadId, turn: { id } });
    setTimeout(() => {
      const failed =
        text.includes("reject-auth") || (config.requireAuth && !read("authenticated.json", false));
      const error = failed
        ? { message: "Native model unauthorized", codexErrorInfo: "unauthorized" }
        : null;
      const item = { id: "answer-" + id, type: "agentMessage", text: "Response " + text };
      if (!failed) notify("item/completed", { threadId, turnId: id, item });
      const value = {
        id,
        status: failed ? "failed" : "completed",
        error,
        items: failed ? [] : [item],
        startedAt: 1,
        completedAt: 2,
      };
      write("turns.json", [...read("turns.json", []), value]);
      notify("turn/completed", { threadId, turn: value });
    }, config.turnDelay ?? 80);
    return;
  }
  send({ id: request.id, result });
});
