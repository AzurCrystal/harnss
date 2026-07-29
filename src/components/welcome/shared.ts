// ── Step definitions ──

export const WIZARD_STEPS = [
  "welcome",
  "appearance",
  "permissions",
  "project",
  "tour",
  "ready",
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

export const WELCOME_COMPLETED_KEY = "harnss-welcome-completed";

// ── Step props ──

export interface WizardStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export interface AppearanceStepProps extends WizardStepProps {
  glassSupported: boolean;
}

export interface PermissionsStepProps extends WizardStepProps {
  permissionMode: string;
  onPermissionModeChange: (mode: string) => void;
}

export interface ProjectStepProps extends WizardStepProps {
  onCreateProject: () => void;
  hasProjects: boolean;
}

export interface ReadyStepProps {
  permissionMode: string;
  onComplete: () => void;
}

// ── Permission mode data ──

export const PERMISSION_MODES = [
  {
    id: "default",
    label: "编辑前询问",
    description:
      "智能体在修改文件或运行命令前会请求你的批准。",
    icon: "Shield" as const,
  },
  {
    id: "acceptEdits",
    label: "自动接受编辑",
    description:
      "文件编辑自动批准，运行命令仍需确认。",
    icon: "ShieldCheck" as const,
  },
  {
    id: "bypassPermissions",
    label: "全部允许",
    description:
      "所有操作自动执行，不再弹出提示。",
    icon: "ShieldOff" as const,
  },
] as const;

// ── Animation ──

export const springTransition = {
  type: "spring" as const,
  damping: 30,
  stiffness: 300,
  mass: 0.8,
};

// ── Space color showcase data ──

export interface SpaceShowcase {
  name: string;
  emoji: string;
  hue: number;
  chroma: number;
}

export const SHOWCASE_SPACES: SpaceShowcase[] = [
  { name: "前端", emoji: "🎨", hue: 260, chroma: 0.15 },
  { name: "API", emoji: "⚡", hue: 150, chroma: 0.15 },
  { name: "移动端", emoji: "📱", hue: 340, chroma: 0.15 },
  { name: "DevOps", emoji: "🚀", hue: 45, chroma: 0.15 },
];

// ── Tool panel showcase data ──

export interface ToolShowcase {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const SHOWCASE_TOOLS: ToolShowcase[] = [
  { id: "terminal", label: "终端", icon: "Terminal", description: "运行命令和脚本" },
  { id: "git", label: "源代码管理", icon: "GitBranch", description: "提交、分支、差异对比" },
  { id: "browser", label: "浏览器", icon: "Globe", description: "预览与检查" },
  { id: "files", label: "打开的文件", icon: "FileText", description: "跟踪访问过的文件" },
  { id: "project-files", label: "项目", icon: "FolderTree", description: "浏览文件树" },
];

/** Preview background for a space color swatch. */
export function getSpacePreviewBg(hue: number, chroma: number): string {
  const c = Math.min(chroma, 0.18);
  return `oklch(0.52 ${c} ${hue})`;
}
