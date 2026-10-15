import assert from "node:assert/strict";
import { it } from "node:test";
import {
  parseThreadReferenceDrag,
  threadReferenceInsert,
  threadReferenceOf,
  threadReferenceUri,
} from "@deepseek-ai/dsh-client-ui-conversation/thread-reference";

const shared = (id: string, title = "Same title") => {
  const reference = threadReferenceOf({
    id,
    title,
    blank: false,
    projectionValues: { threadReference: { hostId: "local" } },
  });
  assert.ok(reference);
  return reference;
};

it("keeps canonical identity and local source independent of display title", () => {
  const a = shared("canonical-a"),
    b = shared("canonical-b");
  assert.equal(a.title, b.title);
  assert.equal(threadReferenceUri(a), "thread://canonical-a?hostId=local");
  assert.notEqual(threadReferenceInsert(a).ref, threadReferenceInsert(b).ref);
  assert.equal(
    threadReferenceInsert(a).clipboardText,
    "[@Same title](thread://canonical-a?hostId=local)",
  );
  assert.equal(shared("abcdefgh-123", " \n ").title, "abcdefgh");
});

it("escapes Markdown, HTML-looking titles, newlines, and opaque ID delimiters", () => {
  const ref = shared("id)[]/?#", "a](evil)\\\n<b> *_`title`");
  const insert = threadReferenceInsert(ref);
  assert.equal(insert.label, "a](evil)\\ <b> *_`title`");
  assert.equal(
    insert.clipboardText,
    "[@a\\]\\(evil\\)\\\\ \\<b\\> \\*\\_\\`title\\`](thread://id%29%5B%5D%2F%3F%23?hostId=local)",
  );
  assert.deepEqual(parseThreadReferenceDrag(JSON.stringify(ref)), ref);
  assert.equal(parseThreadReferenceDrag("not json"), undefined);
  assert.equal(parseThreadReferenceDrag(JSON.stringify({ ...ref, hostId: "remote" })), undefined);
});

it("does not infer shared ownership from a Harness, UUID, or uncreated draft", () => {
  for (const session of [
    { id: "isolated-codex", blank: false, projectionValues: {} },
    { id: "official-thread", blank: false },
    { id: "draft", blank: true, projectionValues: { threadReference: { hostId: "local" } } },
    { id: "remote", blank: false, projectionValues: { threadReference: { hostId: "remote" } } },
  ])
    assert.equal(threadReferenceOf(session), undefined);
});
