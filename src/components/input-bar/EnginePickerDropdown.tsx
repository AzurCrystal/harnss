import { memo } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OmpThinkingLevel } from "@shared/types/omp";
import { AgentIcon } from "@/components/AgentIcon";
import { OMP_ENGINE_ICON } from "@/lib/engine-icons";
import { TOOLBAR_BTN } from "./constants";

interface ModelItem {
  id: string;
  label: string;
  description: string;
}

export interface EnginePickerDropdownProps {
  isProcessing: boolean;
  selectedModelId: string;
  selectedModelLabel: string;
  modelList: ModelItem[];
  modelsLoading: boolean;
  modelsLoadingText: string;
  onModelChange: (model: string) => void;
  thinkingLevels?: OmpThinkingLevel[];
  thinkingLevel?: OmpThinkingLevel;
  onThinkingLevelChange?: (level: OmpThinkingLevel) => void;
}

/** OMP model and thinking picker in the input bar toolbar. */
export const EnginePickerDropdown = memo(function EnginePickerDropdown({
  isProcessing,
  selectedModelId,
  selectedModelLabel,
  modelList,
  modelsLoading,
  modelsLoadingText,
  onModelChange,
  thinkingLevels,
  thinkingLevel,
  onThinkingLevelChange,
}: EnginePickerDropdownProps) {
  const availableThinkingLevels = thinkingLevels ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={TOOLBAR_BTN}
          disabled={isProcessing}
        >
          <AgentIcon
            icon={OMP_ENGINE_ICON}
            size={14}
            className="shrink-0"
          />
          OMP
          {!modelsLoading && selectedModelLabel && (
            <span className="text-muted-foreground/70">
              · {selectedModelLabel}
            </span>
          )}
          {modelsLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50" />
          )}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {!modelsLoading && modelList.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelChange(model.id)}
            className={model.id === selectedModelId ? "bg-accent" : ""}
          >
            <div>
              <div>{model.label}</div>
              {model.description && (
                <div className="text-[10px] text-muted-foreground">
                  {model.description}
                </div>
              )}
            </div>
          </DropdownMenuItem>
        ))}
        {modelsLoading && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {modelsLoadingText}
          </DropdownMenuItem>
        )}
        {availableThinkingLevels.length > 0 && onThinkingLevelChange && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
              思考
            </div>
            {availableThinkingLevels.map((level) => (
              <DropdownMenuItem
                key={level}
                onClick={() => onThinkingLevelChange(level)}
                className={level === thinkingLevel ? "bg-accent" : ""}
              >
                <div className="flex items-center gap-2">
                  <span className="capitalize">{level}</span>
                  {level === thinkingLevel && (
                    <span className="text-[10px] text-muted-foreground">
                      当前
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
