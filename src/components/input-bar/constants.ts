import type { AcpPermissionBehavior } from "@/types";

/** Shared className overrides for ghost toolbar buttons in the input bar.
 *  Applied on top of `<Button variant="ghost" size="xs">` to match the
 *  toolbar look: muted text, subtle hover, rounded-lg corners. */
export const TOOLBAR_BTN =
  "rounded-lg font-normal text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export type AcceptedMediaType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export const ACP_PERMISSION_BEHAVIORS = [
  {
    id: "ask" as const,
    label: "询问",
    description: "显示权限提示",
  },
  {
    id: "auto_accept" as const,
    label: "自动接受",
    description: "自动批准每次工具调用",
  },
  {
    id: "allow_all" as const,
    label: "全部允许",
    description: "自动批准并始终允许",
  },
] as const satisfies ReadonlyArray<{
  id: AcpPermissionBehavior;
  label: string;
  description: string;
}>;

export const PERMISSION_MODES = [
  { id: "default", label: "编辑前询问" },
  { id: "acceptEdits", label: "接受编辑" },
  { id: "bypassPermissions", label: "全部允许" },
] as const;

export const CODEX_PERMISSION_MODE_DETAILS: Record<
  (typeof PERMISSION_MODES)[number]["id"],
  { policy: string; description: string }
> = {
  default: {
    policy: "on-request",
    description: "执行命令和文件编辑前进行提示",
  },
  acceptEdits: {
    policy: "untrusted",
    description:
      "自动批准可信编辑；不可信操作需确认",
  },
  bypassPermissions: {
    policy: "never",
    description: "不显示审批提示",
  },
};
