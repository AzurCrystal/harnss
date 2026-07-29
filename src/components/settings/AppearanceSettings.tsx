import { memo } from "react";
import { SunMoon, Layout, Blend, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingRow, SettingsSelect, SettingsHeader, SettingsSection } from "@/components/settings/shared";
import { useSettingsStore, deriveMacBackgroundEffect } from "@/stores/settings-store";
import { isMac } from "@/lib/utils";

// ── Props ──

interface AppearanceSettingsProps {
  /** Whether the platform supports transparency (glass/mica) */
  glassSupported: boolean;
  macLiquidGlassSupported: boolean;
}

// ── Component ──

export const AppearanceSettings = memo(function AppearanceSettings({
  glassSupported,
  macLiquidGlassSupported,
}: AppearanceSettingsProps) {
  // ── Read all appearance settings from the Zustand store ──
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const islandLayout = useSettingsStore((s) => s.islandLayout);
  const setIslandLayout = useSettingsStore((s) => s.setIslandLayout);
  const islandShine = useSettingsStore((s) => s.islandShine);
  const setIslandShine = useSettingsStore((s) => s.setIslandShine);
  const macBackgroundEffect = useSettingsStore((s) => deriveMacBackgroundEffect(s));
  const setMacBackgroundEffect = useSettingsStore((s) => s.setMacBackgroundEffect);
  const autoGroupTools = useSettingsStore((s) => s.autoGroupTools);
  const setAutoGroupTools = useSettingsStore((s) => s.setAutoGroupTools);
  const avoidGroupingEdits = useSettingsStore((s) => s.avoidGroupingEdits);
  const setAvoidGroupingEdits = useSettingsStore((s) => s.setAvoidGroupingEdits);
  const autoExpandTools = useSettingsStore((s) => s.autoExpandTools);
  const setAutoExpandTools = useSettingsStore((s) => s.setAutoExpandTools);
  const expandEditToolCallsByDefault = useSettingsStore((s) => s.expandEditToolCallsByDefault);
  const setExpandEditToolCallsByDefault = useSettingsStore((s) => s.setExpandEditToolCallsByDefault);
  const showToolIcons = useSettingsStore((s) => s.showToolIcons);
  const setShowToolIcons = useSettingsStore((s) => s.setShowToolIcons);
  const coloredToolIcons = useSettingsStore((s) => s.coloredToolIcons);
  const setColoredToolIcons = useSettingsStore((s) => s.setColoredToolIcons);
  const transparentToolPicker = useSettingsStore((s) => s.transparentToolPicker);
  const setTransparentToolPicker = useSettingsStore((s) => s.setTransparentToolPicker);
  const coloredSidebarIcons = useSettingsStore((s) => s.coloredSidebarIcons);
  const setColoredSidebarIcons = useSettingsStore((s) => s.setColoredSidebarIcons);
  const transparency = useSettingsStore((s) => s.transparency);
  const setTransparency = useSettingsStore((s) => s.setTransparency);

  const onThemeChange = setTheme;
  const onIslandLayoutChange = setIslandLayout;
  const onIslandShineChange = setIslandShine;
  const onMacBackgroundEffectChange = setMacBackgroundEffect;
  const onAutoGroupToolsChange = setAutoGroupTools;
  const onAvoidGroupingEditsChange = setAvoidGroupingEdits;
  const onAutoExpandToolsChange = setAutoExpandTools;
  const onExpandEditToolCallsByDefaultChange = setExpandEditToolCallsByDefault;
  const onShowToolIconsChange = setShowToolIcons;
  const onColoredToolIconsChange = setColoredToolIcons;
  const onTransparentToolPickerChange = setTransparentToolPicker;
  const onColoredSidebarIconsChange = setColoredSidebarIcons;
  const onTransparencyChange = setTransparency;

  const effectiveMacBackgroundEffect = !macLiquidGlassSupported && macBackgroundEffect === "liquid-glass"
    ? "vibrancy"
    : macBackgroundEffect;

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader title="外观" description="自定义界面的外观与质感" />

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-2">
          {/* ── Theme section ── */}
          <SettingsSection icon={SunMoon} label="主题" first>
            <SettingRow
              label="颜色主题"
              description="选择浅色或深色外观，或跟随系统设置。"
            >
              <SettingsSelect
                value={theme}
                onValueChange={onThemeChange}
                options={[
                  { value: "dark", label: "深色" },
                  { value: "light", label: "浅色" },
                  { value: "system", label: "跟随系统" },
                ]}
              />
            </SettingRow>
          </SettingsSection>

          {/* ── Tools section ── */}
          <SettingsSection icon={Wrench} label="工具">
            <SettingRow
              label="自动分组工具调用"
              description="将连续的工具调用折叠为一个分组。关闭后，每个工具调用和中间的思考行都会单独显示。"
            >
              <Switch
                checked={autoGroupTools}
                onCheckedChange={onAutoGroupToolsChange}
              />
            </SettingRow>

            <SettingRow
              label="编辑类调用不参与分组"
              description="即使开启自动分组，Edit 和 Write 工具调用也始终单独成行。编辑前后的 Read 调用会各自形成独立分组。"
            >
              <Switch
                checked={avoidGroupingEdits}
                onCheckedChange={onAvoidGroupingEditsChange}
                disabled={!autoGroupTools}
              />
            </SettingRow>

            <SettingRow
              label="自动展开工具结果"
              description="已完成的工具调用会暂时展开，稍候自动折叠。关闭后，工具行保持折叠状态，除非你手动展开。"
            >
              <Switch
                checked={autoExpandTools}
                onCheckedChange={onAutoExpandToolsChange}
              />
            </SettingRow>

            <SettingRow
              label="默认展开 Edit 和 Write 工具"
              description="Edit 和 Write 工具调用出现时默认保持展开。关闭后，它们会保持折叠，直到你手动展开。"
            >
              <Switch
                checked={expandEditToolCallsByDefault}
                onCheckedChange={onExpandEditToolCallsByDefaultChange}
              />
            </SettingRow>

            <SettingRow
              label="显示工具图标"
              description="在工具调用标签旁显示图标。关闭后仅显示文字。"
            >
              <Switch
                checked={showToolIcons}
                onCheckedChange={onShowToolIconsChange}
              />
            </SettingRow>

            <SettingRow
              label="彩色工具图标"
              description="按工具类型为工具图标着色。关闭后图标为单色。"
            >
              <Switch
                checked={coloredToolIcons}
                onCheckedChange={onColoredToolIconsChange}
                disabled={!showToolIcons}
              />
            </SettingRow>
          </SettingsSection>

          {/* ── Layout section ── */}
          <SettingsSection icon={Layout} label="布局">
            <div className="py-3">
              <p className="text-sm font-medium text-foreground">窗口布局</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                选择窗口中面板的排列方式。
              </p>
              <div className="mt-3 flex gap-3">
                {/* ── Island preview ── */}
                <button
                  type="button"
                  className={`group flex-1 rounded-lg border-2 p-2.5 transition-colors ${
                    islandLayout
                      ? "border-primary bg-primary/[0.04]"
                      : "border-transparent bg-foreground/[0.03] hover:bg-foreground/[0.05]"
                  }`}
                  onClick={() => onIslandLayoutChange(true)}
                >
                  {/* Mini app illustration — islands with gaps and rounded corners */}
                  <div className="flex h-[72px] gap-1 rounded-md bg-foreground/[0.04] p-1.5">
                    {/* Sidebar */}
                    <div className="w-[26%] rounded-[5px] bg-foreground/[0.07]" />
                    {/* Chat */}
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex-1 rounded-[5px] bg-foreground/[0.07]" />
                      {/* Bottom bar hint */}
                      <div className="h-2.5 rounded-[4px] bg-foreground/[0.05]" />
                    </div>
                    {/* Tool column */}
                    <div className="flex w-[22%] flex-col gap-1">
                      <div className="flex-1 rounded-[5px] bg-foreground/[0.07]" />
                      <div className="h-[40%] rounded-[5px] bg-foreground/[0.07]" />
                    </div>
                    {/* Tool picker strip */}
                    <div className="flex w-2 flex-col items-center gap-1 pt-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-foreground/10" />
                      <div className="h-1.5 w-1.5 rounded-full bg-foreground/10" />
                      <div className="h-1.5 w-1.5 rounded-full bg-foreground/10" />
                    </div>
                  </div>
                  <p className={`mt-2 text-center text-xs font-medium ${
                    islandLayout ? "text-primary" : "text-muted-foreground"
                  }`}>
                    岛屿
                  </p>
                </button>

                {/* ── Flat preview ── */}
                <button
                  type="button"
                  className={`group flex-1 rounded-lg border-2 p-2.5 transition-colors ${
                    !islandLayout
                      ? "border-primary bg-primary/[0.04]"
                      : "border-transparent bg-foreground/[0.03] hover:bg-foreground/[0.05]"
                  }`}
                  onClick={() => onIslandLayoutChange(false)}
                >
                  {/* Mini app illustration — flat edge-to-edge with 1px dividers */}
                  <div className="flex h-[72px] overflow-hidden rounded-md bg-foreground/[0.04]">
                    {/* Sidebar */}
                    <div className="w-[26%] bg-foreground/[0.07]" />
                    {/* Divider */}
                    <div className="w-px bg-foreground/15" />
                    {/* Chat */}
                    <div className="flex flex-1 flex-col">
                      <div className="flex-1 bg-foreground/[0.07]" />
                      <div className="h-px bg-foreground/15" />
                      <div className="h-2.5 bg-foreground/[0.05]" />
                    </div>
                    {/* Divider */}
                    <div className="w-px bg-foreground/15" />
                    {/* Tool column */}
                    <div className="flex w-[22%] flex-col">
                      <div className="flex-1 bg-foreground/[0.07]" />
                      <div className="h-px bg-foreground/15" />
                      <div className="h-[40%] bg-foreground/[0.07]" />
                    </div>
                    {/* Divider */}
                    <div className="w-px bg-foreground/15" />
                    {/* Tool picker strip */}
                    <div className="flex w-2 flex-col items-center gap-1 bg-foreground/[0.04] pt-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-foreground/10" />
                      <div className="h-1.5 w-1.5 rounded-full bg-foreground/10" />
                      <div className="h-1.5 w-1.5 rounded-full bg-foreground/10" />
                    </div>
                  </div>
                  <p className={`mt-2 text-center text-xs font-medium ${
                    !islandLayout ? "text-primary" : "text-muted-foreground"
                  }`}>
                    平铺
                  </p>
                </button>
              </div>
            </div>

            <SettingRow
              label="彩色侧边栏图标"
              description="按工具类型为工具选择器和面板标题栏图标着色。关闭后图标为中性单色。"
            >
              <Switch
                checked={coloredSidebarIcons}
                onCheckedChange={onColoredSidebarIconsChange}
              />
            </SettingRow>

            <SettingRow
              label="岛屿边框光泽"
              description="在岛屿面板边框上显示细腻的对角反光。仅在岛屿布局模式下可见。"
            >
              <Switch
                checked={islandShine}
                onCheckedChange={onIslandShineChange}
                disabled={!islandLayout}
              />
            </SettingRow>
          </SettingsSection>

          {/* ── Transparency section ── */}
          <SettingsSection icon={Blend} label="透明度">
            <SettingRow
              label={isMac ? "窗口背景效果" : "窗口透明度"}
              description={
                isMac
                  ? (
                    macLiquidGlassSupported
                      ? "选择 macOS 原生背景材质。“关闭模糊”会保持窗口不透明；从 Liquid Glass 切换到 Vibrancy 需要重启。"
                      : "选择 macOS 原生背景材质。此 Mac 不支持 Liquid Glass，可选择 Vibrancy 或“关闭”。"
                  )
                  : (
                    glassSupported
                      ? "让桌面透过窗口背景显示。在 Windows 上启用后使用 Mica 材质。"
                      : "当前平台不支持窗口透明度。"
                  )
              }
            >
              {isMac ? (
                <SettingsSelect
                  value={effectiveMacBackgroundEffect}
                  onValueChange={onMacBackgroundEffectChange}
                  options={[
                    ...(macLiquidGlassSupported
                      ? [{ value: "liquid-glass" as const, label: "Liquid Glass" }]
                      : []),
                    { value: "vibrancy", label: "Vibrancy" },
                    { value: "off", label: "关闭模糊" },
                  ]}
                  className="min-w-[9.5rem]"
                />
              ) : (
                <Switch
                  checked={transparency}
                  onCheckedChange={onTransparencyChange}
                  disabled={!glassSupported}
                />
              )}
            </SettingRow>

            <SettingRow
              label="透明工具选择器"
              description="移除右侧工具选择器栏的背景，让图标直接悬浮在窗口之上。"
            >
              <Switch
                checked={transparentToolPicker}
                onCheckedChange={onTransparentToolPickerChange}
              />
            </SettingRow>
          </SettingsSection>
        </div>
      </ScrollArea>
    </div>
  );
});
