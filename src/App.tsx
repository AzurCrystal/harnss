import { useEffect } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { syncAnalyticsSettings } from "@/lib/analytics/posthog";

export function App() {
  // Sync analytics opt-in state after mount — avoids blocking first paint with IPC calls
  useEffect(() => {
    syncAnalyticsSettings();
  }, []);
  // Guard: if the preload script failed, window.claude won't exist.
  // Throwing here lets the ErrorBoundary show a visible message instead of a blank window.
  if (!window.claude) {
    throw new Error(
      "window.claude 不可用——预加载脚本可能加载失败。" +
      "请检查 Electron 控制台中的错误。",
    );
  }

  return (
    <TooltipProvider>
      <AppLayout />
      <Toaster
        position="top-right"
        toastOptions={{
          className: "bg-background/90 backdrop-blur-md border border-border text-foreground shadow-lg",
        }}
      />
    </TooltipProvider>
  );
}
