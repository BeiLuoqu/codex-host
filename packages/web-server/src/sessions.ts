/** Browser interaction projection for sessions executed by the shared Host. */
import { SessionRuntimeError } from "@codexhost/session-runtime";
import type { EventHub } from "./transport.ts";
export type { SessionNotification } from "@codexhost/session-runtime";

export function bridgeSessionInteraction(
  events: EventHub,
  sessionId: string,
  interaction: Record<string, unknown> & { type: string },
): { result: Promise<unknown>; cancel(): void } {
  if (interaction.type === "approval") {
    const actions = interaction.actions as Array<{ id: string; label: string; effect: string }>;
    const allow =
      actions.find((action) => action.effect === "allowOnce") ??
      actions.find((action) => action.effect !== "deny");
    const deny = actions.find((action) => action.effect === "deny");
    const title = String(interaction.title ?? "Approval required");
    const description =
      typeof interaction.description === "string" ? interaction.description : undefined;
    const invocation = events.invoke("approval/request", sessionId, {
      toolName: title,
      reason: description === undefined ? title : `${title}\n\n${description}`,
      displayReason: { en: description === undefined ? title : `${title}\n\n${description}` },
    });
    const result = new Promise<unknown>((resolve, reject) => {
      invocation.result.then((value) => {
        const action = value === "allowed-once" ? allow : deny;
        if (action !== undefined) resolve({ type: "approval", actionId: action.id });
        else
          reject(
            new SessionRuntimeError(
              "session/interaction-invalid",
              "Approval does not offer a matching action",
            ),
          );
      }, reject);
    });
    return { result, cancel: invocation.cancel };
  }
  if (interaction.type === "question") {
    const questions = interaction.questions as Array<
      | {
          id: string;
          type: "choice";
          prompt: string;
          options: Array<{ value: string; label: string; description?: string }>;
          multiple: boolean;
          allowOther: boolean;
        }
      | { id: string; type: "text"; prompt: string }
    >;
    const items = questions.map((question) =>
      question.type === "choice"
        ? {
            id: question.id,
            question: question.prompt,
            ...(typeof interaction.title === "string" ? { header: interaction.title } : {}),
            options: question.options.map((option) => ({
              label: option.label,
              ...(option.description === undefined ? {} : { description: option.description }),
            })),
            multiSelect: question.multiple,
          }
        : { id: question.id, question: question.prompt },
    );
    const invocation = events.invoke("user-questions/request", sessionId, {
      questions: items,
    });
    const result = new Promise<unknown>((resolve, reject) => {
      invocation.result.then((value) => {
        const answer = value as
          { answers?: Array<{ id: string; selected: string[]; custom?: string }> } | undefined;
        const answers: Record<string, string[]> = {};
        for (const question of questions) {
          const item = answer?.answers?.find((entry) => entry.id === question.id);
          if (item === undefined) continue;
          const values =
            question.type === "choice"
              ? item.selected.map(
                  (label) =>
                    question.options.find((option) => option.label === label)?.value ?? label,
                )
              : [];
          if (item.custom !== undefined && item.custom !== "") values.push(item.custom);
          answers[question.id] = values;
        }
        resolve({ type: "question", answers });
      }, reject);
    });
    return { result, cancel: invocation.cancel };
  }
  throw new Error("Unsupported session interaction");
}
