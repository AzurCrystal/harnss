import { useEffect, useState } from "react";
import {
  Loader2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToolCall } from "@/components/ToolCall";
import { AgentIcon } from "@/components/AgentIcon";
import { OMP_ENGINE_ICON } from "@/lib/engine-icons";
import { reportError } from "@/lib/analytics/analytics";
import type { UIMessage } from "@/types";

const OMP_ICON = OMP_ENGINE_ICON;
const REMARK_PLUGINS = [remarkGfm];

interface AgentTranscriptViewerProps {
  parentSessionId: string;
  subagentId: string;
  sessionFile?: string;
  agentDescription: string;
  expandEditToolCallsByDefault: boolean;
  onClose: () => void;
}

interface OmpTextBlock {
  type: "text";
  text: string;
}

interface OmpThinkingBlock {
  type: "thinking";
  thinking: string;
}

interface OmpToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
  arguments: unknown;
}

type OmpAssistantBlock = OmpTextBlock | OmpThinkingBlock | OmpToolCallBlock;

interface OmpAssistantMessage {
  role: "assistant";
  content: OmpAssistantBlock[];
}

interface OmpToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: unknown;
  details?: unknown;
  isError: boolean;
}

type TranscriptMessage = OmpAssistantMessage | OmpToolResultMessage;

type DisplayItem =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; message: UIMessage };

/**
 * Modal dialog displaying an OMP subagent transcript through the official RPC.
 * Assistant blocks and paired tool-result messages reuse the main ToolCall UI.
 */
export function AgentTranscriptViewer({
  parentSessionId,
  subagentId,
  sessionFile,
  agentDescription,
  expandEditToolCallsByDefault,
  onClose,
}: AgentTranscriptViewerProps) {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.claude.omp.command(
          parentSessionId,
          sessionFile
            ? { type: "get_subagent_messages", sessionFile }
            : { type: "get_subagent_messages", subagentId },
        );
        if (cancelled) return;
        if (result.error) {
          setError(result.error);
        } else {
          const messages = parseTranscriptMessages(result.data);
          if (!messages) {
            setError("OMP 返回了无效的子智能体记录");
          } else {
            setItems(buildDisplayItems(messages));
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(reportError("TRANSCRIPT_LOAD", err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [parentSessionId, sessionFile, subagentId]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl h-[70vh] flex flex-col p-0 gap-0" aria-describedby={undefined}>
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AgentIcon icon={OMP_ICON} size={16} className="opacity-60" />
            智能体记录 — {agentDescription}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="py-3 space-y-1">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-foreground/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载记录…
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 px-5 py-4 text-sm text-red-400/70">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="py-8 text-center text-sm text-foreground/40">
                暂无记录数据。
              </div>
            )}

            {items.map((item, i) => (
              <TranscriptItem
                key={i}
                item={item}
                expandEditToolCallsByDefault={expandEditToolCallsByDefault}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Render each display item ──

function TranscriptItem({
  item,
  expandEditToolCallsByDefault,
}: {
  item: DisplayItem;
  expandEditToolCallsByDefault: boolean;
}) {
  switch (item.kind) {
    case "text":
      return <TextRow text={item.text} />;
    case "thinking":
      return <ThinkingRow text={item.text} />;
    case "tool":
      return (
        <div className="px-4 py-0.5">
          <ToolCall
            message={item.message}
            compact
            autoExpandTools={false}
            expandEditToolCallsByDefault={expandEditToolCallsByDefault}
          />
        </div>
      );
  }
}

function TextRow({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 px-5 py-1">
      <AgentIcon icon={OMP_ICON} size={14} className="mt-1 shrink-0 opacity-50" />
      <div className="min-w-0 flex-1 prose dark:prose-invert prose-xs max-w-none text-[12px] text-foreground/70 wrap-break-word
        [&_p]:my-1 [&_p]:leading-relaxed
        [&_pre]:my-1 [&_pre]:rounded [&_pre]:bg-foreground/[0.04] [&_pre]:px-2 [&_pre]:py-1.5 [&_pre]:text-[11px]
        [&_code]:text-[11px] [&_code]:text-foreground/60
        [&_ul]:my-1 [&_ul]:ps-4 [&_ol]:my-1 [&_ol]:ps-4
        [&_li]:my-0 [&_li]:text-[12px]
        [&_strong]:text-foreground/80">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

function ThinkingRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const preview = text.slice(0, 80) + (text.length > 80 ? "…" : "");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-1.5 px-5 py-0.5 text-[11px] text-foreground/30 cursor-pointer hover:text-foreground/50 transition-colors">
          <ChevronRight className={`h-2.5 w-2.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="italic truncate">思考：{preview}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mx-5 ms-9 px-2 py-1.5 text-[11px] text-foreground/35 italic whitespace-pre-wrap wrap-break-word border-s border-foreground/10">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Parse OMP transcript messages into display items ──

function parseTranscriptMessages(data: unknown): TranscriptMessage[] | null {
  if (!isRecord(data) || !Array.isArray(data.messages)) return null;

  const messages: TranscriptMessage[] = [];
  for (const rawMessage of data.messages) {
    if (!isRecord(rawMessage)) continue;

    if (rawMessage.role === "assistant" && Array.isArray(rawMessage.content)) {
      const content: OmpAssistantBlock[] = [];
      for (const rawBlock of rawMessage.content) {
        if (!isRecord(rawBlock)) continue;
        if (rawBlock.type === "text" && typeof rawBlock.text === "string") {
          content.push({ type: "text", text: rawBlock.text });
        } else if (rawBlock.type === "thinking" && typeof rawBlock.thinking === "string") {
          content.push({ type: "thinking", thinking: rawBlock.thinking });
        } else if (
          rawBlock.type === "toolCall"
          && typeof rawBlock.id === "string"
          && typeof rawBlock.name === "string"
        ) {
          content.push({
            type: "toolCall",
            id: rawBlock.id,
            name: rawBlock.name,
            arguments: rawBlock.arguments,
          });
        }
      }
      messages.push({ role: "assistant", content });
      continue;
    }

    if (
      rawMessage.role === "toolResult"
      && typeof rawMessage.toolCallId === "string"
      && typeof rawMessage.toolName === "string"
      && "content" in rawMessage
    ) {
      messages.push({
        role: "toolResult",
        toolCallId: rawMessage.toolCallId,
        toolName: rawMessage.toolName,
        content: rawMessage.content,
        ...("details" in rawMessage ? { details: rawMessage.details } : {}),
        isError: rawMessage.isError === true,
      });
    }
  }
  return messages;
}

function buildDisplayItems(messages: TranscriptMessage[]): DisplayItem[] {
  const results = new Map<string, OmpToolResultMessage>();
  for (const message of messages) {
    if (message.role === "toolResult") results.set(message.toolCallId, message);
  }

  const items: DisplayItem[] = [];
  let toolCounter = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type === "text") {
        if (block.text.trim()) items.push({ kind: "text", text: block.text });
        continue;
      }
      if (block.type === "thinking") {
        if (block.thinking.trim()) items.push({ kind: "thinking", text: block.thinking });
        continue;
      }

      const result = results.get(block.id);
      const toolResult = result ? toolResultFor(result) : undefined;
      const toolInput = isRecord(block.arguments)
        ? block.arguments
        : block.arguments === undefined ? {} : { value: block.arguments };
      const toolMessage: UIMessage = {
        id: `transcript-tool-${toolCounter++}`,
        role: "tool_call",
        content: "",
        toolName: block.name,
        toolInput,
        ...(toolResult ? { toolResult } : {}),
        ...(result?.isError ? { toolError: true } : {}),
        timestamp: Date.now(),
      };
      items.push({ kind: "tool", message: toolMessage });
    }
  }
  return items;
}

function toolResultFor(message: OmpToolResultMessage): UIMessage["toolResult"] {
  const text = messageContentText(message.content);
  const details = message.details;
  if (!text && !isRecord(details)) return undefined;

  const result: NonNullable<UIMessage["toolResult"]> = {};
  if (text) {
    result.content = text;
    result.stdout = text;
  }
  if (isRecord(details)) {
    result.structuredContent = details;
    if (typeof details.stdout === "string") result.stdout = details.stdout;
    if (typeof details.stderr === "string") result.stderr = details.stderr;
  }
  return result;
}

function messageContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const text: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      text.push(block.text);
    }
  }
  return text.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
