import type { ChatSession, SessionInfo } from "@/types";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}


export function getSessionNotificationActor(
  session: Pick<ChatSession, "engine" | "model"> | null | undefined,
  sessionInfo?: Pick<SessionInfo, "model" | "agentName"> | null,
): string {
  const model = normalize(sessionInfo?.model) || normalize(session?.model);
  return model || "OMP";
}
