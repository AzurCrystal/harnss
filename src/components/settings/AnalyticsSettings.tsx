import { memo, useState, useCallback, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingRow, SettingsHeader, SettingsSection } from "@/components/settings/shared";
import { syncAnalyticsSettings } from "@/lib/analytics/posthog";
import type { AppSettings } from "@/types";

interface AnalyticsSettingsProps {
  appSettings: AppSettings | null;
  onUpdateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

// ── Component ──

export const AnalyticsSettings = memo(function AnalyticsSettings({
  appSettings,
  onUpdateAppSettings,
}: AnalyticsSettingsProps) {
  // Local optimistic state — synced from props once loaded
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (appSettings) {
      setAnalyticsEnabled(appSettings.analyticsEnabled ?? true);
      setUserId(appSettings.analyticsUserId ?? null);
    }
  }, [appSettings]);

  const handleToggleAnalytics = useCallback(
    async (checked: boolean) => {
      setAnalyticsEnabled(checked); // optimistic
      await onUpdateAppSettings({ analyticsEnabled: checked });
      // Sync renderer-side posthog-js opt-in/out state to match
      await syncAnalyticsSettings();
    },
    [onUpdateAppSettings],
  );

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader title="分析" description="分享匿名使用数据，帮助改进 Harnss" />

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-2">
          {/* ── Analytics section ── */}
          <SettingsSection icon={BarChart3} label="使用情况分析" first>
            <SettingRow
              label="发送匿名分析数据"
              description="分享匿名使用数据，帮助我们了解大家如何使用 Harnss 并改进应用。我们仅收集应用版本、平台和基本功能使用情况，不会收集代码、提示词或个人数据。"
            >
              <Switch
                checked={analyticsEnabled}
                onCheckedChange={handleToggleAnalytics}
              />
            </SettingRow>

            {/* Show user ID when analytics is enabled */}
            {analyticsEnabled && userId && (
              <div className="mt-4 rounded-md bg-foreground/[0.03] p-3">
                <p className="text-xs font-medium text-foreground">
                  匿名用户 ID
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                  {userId}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  此随机生成的 ID 仅用于统计独立用户数量，无法识别你的身份。
                </p>
              </div>
            )}
          </SettingsSection>

          {/* ── What we collect section ── */}
          <div className="border-t border-foreground/[0.04] py-3">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              我们会收集
            </h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                <span>应用版本和平台（macOS、Windows、Linux）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                <span>日活跃用户数（用于衡量参与度）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                <span>基本功能使用情况（例如使用了哪些引擎）</span>
              </li>
            </ul>

            <h3 className="mb-2 mt-4 text-sm font-medium text-foreground">
              我们不会收集
            </h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                <span>你的代码、提示词或与 AI 的对话</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                <span>文件路径、项目名称或仓库 URL</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                <span>任何个人身份信息</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                <span>API 密钥或凭据</span>
              </li>
            </ul>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
});
