import type { WhatsAppSession, WhatsAppGroupConfig, WhatsAppMessageResult, WhatsAppWebStatus } from "@aimo/contracts";
import { ApiError, authHooks } from "./api";

async function request<T = WhatsAppSession>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/whatsapp${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // A lost response can follow a successful action. Retrying the same id checks
    // the latest session without repeating it; do not claim it never happened.
    throw new ApiError(0, { error: "Couldn't reach the demo chat. Retry to check the result." });
  }
  let data: T & { error?: string; message?: string };
  try {
    data = await response.json();
  } catch {
    throw new ApiError(response.status, { error: "The chat returned an unreadable response. Retry to check the result." });
  }
  if (response.status === 401 && data.message?.includes("X-Preview-Password")) {
    window.location.href = "/login";
  } else if (response.status === 401) {
    authHooks.onUnauthorized();
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

export const whatsappApi = {
  web: {
    status: () => request<WhatsAppWebStatus>("/web/status"),
    connect: () => request<WhatsAppWebStatus>("/web/connect", {}),
    disconnect: () => request<WhatsAppWebStatus>("/web/disconnect", {}),
    selectGroup: (groupId: string | null) => request<WhatsAppWebStatus>("/web/group", { groupId }),
    refreshGroups: () => request<WhatsAppWebStatus>("/web/groups/refresh", {}),
  },
  config: () => request<WhatsAppGroupConfig>("/config"),
  selectGroup: (groupId: string) => request<WhatsAppGroupConfig>("/config", { groupId }),
  session: () => request("/session"),
  connect: (displayName?: string) => request("/connect", displayName ? { displayName } : {}),
  disconnect: () => request("/disconnect", {}),
  message: (message: { id: string; text: string; groupId: string | null }) => request<WhatsAppMessageResult>("/messages", message),
};
