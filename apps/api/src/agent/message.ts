/** Interpretation shared by speculative preparation and an explicit submission. */
import { parseRequest, parseSimpleRequest } from "./parse.js";
import { messageRoute } from "./judge.js";

export async function interpretMessage(text: string) {
  const simple = parseSimpleRequest(text);
  const route = simple ? { route: "new_request" as const, judgement: null } : await messageRoute(text);
  const parsed = route.route === "event_change" || route.route === "neither"
    ? null
    : simple ? { request: simple, note: null } : await parseRequest(text);
  return { route, parsed };
}
