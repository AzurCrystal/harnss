import {
  Terminal,
  FileText,
  FileEdit,
  Search,
  FolderSearch,
  Globe,
  Bot,
  Wrench,
  ListChecks,
  Lightbulb,
  Map,
  MessageCircleQuestion,
  PackageSearch,
  Sparkles,
} from "lucide-react";

// ── Tool icons ──

export const TOOL_ICONS: Record<string, typeof Terminal> = {
  Bash: Terminal,
  Read: FileText,
  Write: FileEdit,
  Edit: FileEdit,
  Grep: Search,
  Glob: FolderSearch,
  WebSearch: Globe,
  WebFetch: Globe,
  Task: Bot,
  Think: Lightbulb,
  TodoWrite: ListChecks,
  EnterPlanMode: Lightbulb,
  ExitPlanMode: Map,
  AskUserQuestion: MessageCircleQuestion,
  ToolSearch: PackageSearch,
  Skill: Sparkles,
};

export function getToolIcon(toolName: string) {
  return TOOL_ICONS[toolName] ?? Wrench;
}

// ── Tool labels ──

export type ToolLabelType = "past" | "active" | "failure";
type ToolLabels = Record<ToolLabelType, string>;

export const TOOL_LABELS: Record<string, ToolLabels> = {
  Bash: { past: "已运行", active: "正在运行", failure: "运行失败" },
  Read: { past: "已读取", active: "正在读取", failure: "读取失败" },
  Write: { past: "已写入", active: "正在写入", failure: "写入失败" },
  Edit: { past: "已编辑", active: "正在编辑", failure: "编辑失败" },
  Grep: { past: "已搜索", active: "正在搜索", failure: "搜索失败" },
  Glob: { past: "已找到", active: "正在查找", failure: "查找失败" },
  WebSearch: { past: "已搜索网络", active: "正在搜索网络", failure: "搜索网络失败" },
  WebFetch: { past: "已获取", active: "正在获取", failure: "获取失败" },
  TodoWrite: { past: "已更新任务", active: "正在更新任务", failure: "更新任务失败" },
  Think: { past: "已思考", active: "正在思考", failure: "思考失败" },
  EnterPlanMode: { past: "已进入计划模式", active: "正在进入计划模式", failure: "进入计划模式失败" },
  ExitPlanMode: { past: "已展示计划", active: "正在准备计划", failure: "准备计划失败" },
  AskUserQuestion: { past: "已提问", active: "正在提问", failure: "提问失败" },
  ToolSearch: { past: "已加载工具", active: "正在加载工具", failure: "加载工具失败" },
  Skill: { past: "已加载技能", active: "正在加载技能", failure: "加载技能失败" },
};

// MCP tool friendly names — pattern-matched for different server name prefixes
export const MCP_TOOL_LABELS: Array<{ pattern: RegExp; labels: ToolLabels }> = [
  { pattern: /searchJiraIssuesUsingJql$/, labels: { past: "已搜索 Jira", active: "正在搜索 Jira", failure: "搜索 Jira 失败" } },
  { pattern: /getJiraIssue$/, labels: { past: "已获取问题", active: "正在获取问题", failure: "获取问题失败" } },
  { pattern: /getVisibleJiraProjects$/, labels: { past: "已列出项目", active: "正在列出项目", failure: "列出项目失败" } },
  { pattern: /createJiraIssue$/, labels: { past: "已创建问题", active: "正在创建问题", failure: "创建问题失败" } },
  { pattern: /editJiraIssue$/, labels: { past: "已更新问题", active: "正在更新问题", failure: "更新问题失败" } },
  { pattern: /transitionJiraIssue$/, labels: { past: "已转换问题状态", active: "正在转换问题状态", failure: "转换问题状态失败" } },
  { pattern: /addCommentToJiraIssue$/, labels: { past: "已添加评论", active: "正在添加评论", failure: "添加评论失败" } },
  { pattern: /getTransitionsForJiraIssue$/, labels: { past: "已获取状态转换", active: "正在获取状态转换", failure: "获取状态转换失败" } },
  { pattern: /lookupJiraAccountId$/, labels: { past: "已查询用户", active: "正在查询用户", failure: "查询用户失败" } },
  { pattern: /getConfluencePage$/, labels: { past: "已获取页面", active: "正在获取页面", failure: "获取页面失败" } },
  { pattern: /searchConfluenceUsingCql$/, labels: { past: "已搜索 Confluence", active: "正在搜索 Confluence", failure: "搜索 Confluence 失败" } },
  { pattern: /getConfluenceSpaces$/, labels: { past: "已列出空间", active: "正在列出空间", failure: "列出空间失败" } },
  { pattern: /getConfluencePageDescendants$/, labels: { past: "已列出下级页面", active: "正在列出下级页面", failure: "列出下级页面失败" } },
  { pattern: /getPagesInConfluenceSpace$/, labels: { past: "已列出页面", active: "正在列出页面", failure: "列出页面失败" } },
  { pattern: /createConfluencePage$/, labels: { past: "已创建页面", active: "正在创建页面", failure: "创建页面失败" } },
  { pattern: /updateConfluencePage$/, labels: { past: "已更新页面", active: "正在更新页面", failure: "更新页面失败" } },
  { pattern: /getAccessibleAtlassianResources$/, labels: { past: "已获取资源", active: "正在获取资源", failure: "获取资源失败" } },
  { pattern: /atlassianUserInfo$/, labels: { past: "已获取用户信息", active: "正在获取用户信息", failure: "获取用户信息失败" } },
  { pattern: /Atlassian[/_]+search$/, labels: { past: "已搜索 Atlassian", active: "正在搜索 Atlassian", failure: "搜索 Atlassian 失败" } },
  { pattern: /Atlassian[/_]+fetch$/, labels: { past: "已获取资源", active: "正在获取资源", failure: "获取资源失败" } },
  // Context7
  { pattern: /resolve-library-id$/, labels: { past: "已解析库", active: "正在解析库", failure: "解析库失败" } },
  { pattern: /query-docs$/, labels: { past: "已查询文档", active: "正在查询文档", failure: "查询文档失败" } },
];

export function getMcpToolLabel(toolName: string, type: ToolLabelType): string | null {
  for (const { pattern, labels } of MCP_TOOL_LABELS) {
    if (pattern.test(toolName)) return labels[type];
  }
  // Generic fallback for any MCP tool (mcp__Server__tool) or ACP tool (Tool: Server/tool)
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    const server = parts[1] ?? "MCP";
    if (type === "past") return `已调用 ${server}`;
    if (type === "active") return `正在调用 ${server}`;
    return `调用 ${server}`;
  }
  if (toolName.startsWith("Tool: ")) {
    const server = toolName.slice(6).split("/")[0] ?? "MCP";
    if (type === "past") return `已调用 ${server}`;
    if (type === "active") return `正在调用 ${server}`;
    return `调用 ${server}`;
  }
  return null;
}

export function getToolLabel(toolName: string, type: ToolLabelType): string | null {
  if (!toolName) return type === "failure" ? "运行失败" : null;

  const native = TOOL_LABELS[toolName];
  if (native) return native[type];

  const mcp = getMcpToolLabel(toolName, type);
  if (mcp) return mcp;

  return type === "failure" ? `${toolName} 失败` : null;
}

// ── Tool colors ──

export const TOOL_COLORS: Record<string, string> = {
  Bash: "text-[#6ee7b7]",
  Read: "text-[#67e8f9]",
  Write: "text-[#fb923c]",
  Edit: "text-[#fb923c]",
  NotebookEdit: "text-[#fb923c]",
  Grep: "text-[#a78bfa]",
  Glob: "text-[#a78bfa]",
  WebSearch: "text-[#22d3ee]",
  WebFetch: "text-[#22d3ee]",
  Task: "text-[#38bdf8]",
  Think: "text-[#fde68a]",
  TodoWrite: "text-[#34d399]",
  Skill: "text-[#f0abfc]",
  ToolSearch: "text-[#818cf8]",
};

export function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName] ?? "text-foreground/40";
}
