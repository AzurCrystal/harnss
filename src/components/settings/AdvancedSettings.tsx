import { memo, useState, useCallback, useEffect } from "react";
import { Server } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingRow, SettingsHeader, SettingsSection } from "@/components/settings/shared";
import type { AppSettings } from "@/types";

interface AdvancedSettingsProps {
  appSettings: AppSettings | null;
  onUpdateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Resets the welcome wizard so it shows again. Dev-only. */
  onReplayWelcome: () => void;
}

// ── Component ──

export const AdvancedSettings = memo(function AdvancedSettings({
  appSettings,
  onUpdateAppSettings,
  onReplayWelcome,
}: AdvancedSettingsProps) {
  const [codexClientName, setCodexClientName] = useState("Harnss");
  const [showDevFillInChatTitleBar, setShowDevFillInChatTitleBar] = useState(false);
  const [showJiraBoard, setShowJiraBoard] = useState(false);

  useEffect(() => {
    if (appSettings) {
      setCodexClientName(appSettings.codexClientName || "Harnss");
      setShowDevFillInChatTitleBar(!!appSettings.showDevFillInChatTitleBar);
      setShowJiraBoard(!!appSettings.showJiraBoard);
    }
  }, [appSettings]);

  const handleClientNameChange = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setCodexClientName(trimmed);
      await onUpdateAppSettings({ codexClientName: trimmed });
    },
    [onUpdateAppSettings],
  );

  const handleDevFillToggle = useCallback(
    async (checked: boolean) => {
      setShowDevFillInChatTitleBar(checked);
      await onUpdateAppSettings({ showDevFillInChatTitleBar: checked });
    },
    [onUpdateAppSettings],
  );

  const handleJiraBoardToggle = useCallback(
    async (checked: boolean) => {
      setShowJiraBoard(checked);
      await onUpdateAppSettings({ showJiraBoard: checked });
    },
    [onUpdateAppSettings],
  );

  const isDev = import.meta.env.DEV;

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        title="高级"
        description="协议行为与服务器通信的底层设置"
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-2">
          <SettingsSection icon={Server} label="Codex" first>
            <SettingRow
              label="客户端名称"
              description="应用在与 Codex 服务器握手时标识自身所用的名称。更改将在新会话中生效。"
            >
              <input
                type="text"
                value={codexClientName}
                onChange={(e) => setCodexClientName(e.target.value)}
                onBlur={(e) => handleClientNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleClientNameChange(e.currentTarget.value);
                }}
                spellCheck={false}
                className="h-8 w-40 rounded-md border border-foreground/10 bg-background px-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/20 focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20"
                placeholder="Harnss"
              />
            </SettingRow>

            {isDev && (
              <SettingRow
                label="在对话标题栏显示开发者填充"
                description="在当前对话标题栏启用开发者填充操作。默认隐藏。"
              >
                <Switch
                  checked={showDevFillInChatTitleBar}
                  onCheckedChange={handleDevFillToggle}
                />
              </SettingRow>
            )}

            <SettingRow
              label="启用 Jira 看板"
              description="在项目侧边栏和对话中显示 Jira 看板界面。此功能为开发者预览版。"
            >
              <Switch
                checked={showJiraBoard}
                onCheckedChange={handleJiraBoardToggle}
              />
            </SettingRow>

            {isDev && (
              <SettingRow
                label="重新播放欢迎向导"
                description="重置新手引导标记并重新启动欢迎向导。"
              >
                <button
                  onClick={onReplayWelcome}
                  className="rounded-md border border-foreground/10 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-foreground/[0.03]"
                >
                  重播
                </button>
              </SettingRow>
            )}
          </SettingsSection>
        </div>
      </ScrollArea>
    </div>
  );
});
