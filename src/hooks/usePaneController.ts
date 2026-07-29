/**
 * Per-pane controller hook.
 *
 * Encapsulates the OMP model, permission, thinking, send, and stop logic for
 * a single pane in single-chat and split-view modes.
 */

import { useMemo } from "react";
import type { ChatSession, EngineId, ImageAttachment, ModelInfo } from "@/types";
import type { SessionPaneState } from "@/hooks/session/useSessionPane";
import { DEFAULT_PERMISSION_MODE } from "@/hooks/session/types";
import { canonicalizeModelValue, findEquivalentModel } from "@/lib/model-utils";
import type { PaneController } from "@/types";

function buildPaneModelFallback(model: string | undefined): ModelInfo[] {
  if (!model?.trim()) return [];
  return [{ value: model, displayName: model, description: "" }];
}

function ensureCurrentModel(
  models: ModelInfo[],
  currentModel: string | undefined,
): ModelInfo[] {
  const normalizedModel = currentModel?.trim();
  if (!normalizedModel || findEquivalentModel(normalizedModel, models)) return models;
  return [
    ...models,
    { value: normalizedModel, displayName: normalizedModel, description: "" },
  ];
}

export interface PaneControllerContext {
  settings: {
    getModelForEngine: (engine: EngineId) => string;
    permissionMode: string;
    planMode: boolean;
  };
  handleStop: () => Promise<void>;
  handleComposerClear: () => Promise<void>;
  wrappedHandleSend: (text: string, images?: ImageAttachment[], displayText?: string) => Promise<void>;
  splitView?: {
    setFocusedSession: (sessionId: string | null) => void;
  };
  createSplitPaneDraftSession?: (replacedSessionId: string, projectId: string) => Promise<void>;
  queueSplitPaneSendAfterSwitch?: (sessionId: string, text: string, images?: ImageAttachment[], displayText?: string) => Promise<void>;
}

export function usePaneController(
  sessionId: string,
  session: ChatSession | null,
  paneState: SessionPaneState,
  isActiveSessionPane: boolean,
  ctx: PaneControllerContext,
): PaneController {
  return useMemo(() => {
    const paneEngine: EngineId = "omp";
    const liveModel = paneState.sessionInfo?.model?.trim();
    const persistedModel = session?.model?.trim();
    const defaultModel = isActiveSessionPane
      ? ctx.settings.getModelForEngine(paneEngine).trim()
      : "";
    const rawPaneModel = liveModel || persistedModel || defaultModel;
    const panePermissionMode =
      paneState.sessionInfo?.permissionMode
      ?? session?.permissionMode
      ?? (isActiveSessionPane ? ctx.settings.permissionMode : DEFAULT_PERMISSION_MODE);
    const panePlanMode = panePermissionMode === "plan"
      || !!session?.planMode
      || (isActiveSessionPane && !session && ctx.settings.planMode);
    const paneSupportedModels = ensureCurrentModel(
      paneState.omp.supportedModels.length > 0
        ? paneState.omp.supportedModels
        : buildPaneModelFallback(rawPaneModel),
      rawPaneModel,
    );
    const paneModel = canonicalizeModelValue(rawPaneModel, paneSupportedModels) ?? rawPaneModel;

    const handlePaneModelChange = (nextModel: string) => {
      void paneState.omp.setModel(nextModel);
    };

    const handlePaneThinkingLevelChange = (
      level: NonNullable<typeof paneState.omp.thinkingLevel>,
    ) => {
      void paneState.omp.setThinkingLevel(level);
    };

    const handlePanePlanModeChange = (enabled: boolean) => {
      if (enabled) {
        void paneState.omp.enterPlanMode();
      } else {
        void paneState.omp.exitPlanMode();
      }
    };

    const handlePanePermissionModeChange = (nextMode: string) => {
      void paneState.omp.setPermissionMode(nextMode);
    };


    const handlePaneClear = async () => {
      if (!session) return;
      if (isActiveSessionPane) {
        await ctx.handleComposerClear();
        return;
      }
      await ctx.createSplitPaneDraftSession?.(sessionId, session.projectId);
    };

    const handlePaneSend = async (text: string, images?: ImageAttachment[], displayText?: string) => {
      ctx.splitView?.setFocusedSession(sessionId);

      if (isActiveSessionPane) {
        await ctx.wrappedHandleSend(text, images, displayText);
        return;
      }

      if (!session) return;

      if (!paneState.isConnected) {
        await ctx.queueSplitPaneSendAfterSwitch?.(sessionId, text, images, displayText);
        return;
      }

      const sent = await paneState.omp.send(text, images, displayText);
      if (!sent) {
        await ctx.queueSplitPaneSendAfterSwitch?.(sessionId, text, images, displayText);
      }
    };

    const handlePaneStop = async () => {
      ctx.splitView?.setFocusedSession(sessionId);
      if (isActiveSessionPane) {
        await ctx.handleStop();
        return;
      }
      await paneState.omp.interrupt();
    };

    return {
      paneEngine,
      paneModel,
      paneHeaderModel: liveModel || paneModel,
      panePermissionMode,
      panePlanMode,
      paneSupportedModels,
      paneSlashCommands: paneState.omp.slashCommands,
      paneThinkingLevels: paneState.omp.thinkingLevels,
      paneThinkingLevel: paneState.omp.thinkingLevel,
      handlePaneModelChange,
      handlePaneThinkingLevelChange,
      handlePanePlanModeChange,
      handlePanePermissionModeChange,
      handlePaneClear,
      handlePaneSend,
      handlePaneStop,
    };
  }, [ctx, isActiveSessionPane, paneState, session, sessionId]);
}
