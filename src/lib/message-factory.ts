import type { UIMessage, ImageAttachment } from "@/types";

export function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** Create a system-role UIMessage (info or error). */
export function createSystemMessage(content: string, isError?: boolean): UIMessage {
  return {
    id: nextId(isError ? "sys-err" : "sys"),
    role: "system",
    content,
    isError: isError || undefined,
    timestamp: Date.now(),
  };
}

/** Create a user-role UIMessage with optional images and display text. */
export function createUserMessage(
  content: string,
  images?: ImageAttachment[],
  displayText?: string,
): UIMessage {
  return {
    id: nextId("user"),
    role: "user",
    content,
    timestamp: Date.now(),
    ...(images?.length ? { images } : {}),
    ...(displayText ? { displayContent: displayText } : {}),
  };
}

/** Convert SDK result error subtypes to user-friendly messages. */
export function formatResultError(subtype: string, detail: string): string {
  switch (subtype) {
    case "error_max_turns":
      return "会话已达到最大轮数。请新建会话以继续。";
    case "error_max_budget_usd":
      return "会话已超出费用预算上限。";
    case "error_max_structured_output_retries":
      return "结构化输出在达到最大重试次数后仍失败。";
    case "error_during_execution":
      return detail || "执行期间发生错误。";
    default:
      return detail || "发生了意外错误。";
  }
}
