import { ChevronDown, Map, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TOOLBAR_BTN, PERMISSION_MODES } from "./constants";

/** OMP approval-mode dropdown. */
function PermissionDropdown({
  permissionMode,
  onPermissionModeChange,
  disabled,
}: {
  permissionMode: string;
  onPermissionModeChange: (mode: string) => void;
  disabled?: boolean;
}) {
  const selectedMode = PERMISSION_MODES.find((mode) => mode.id === permissionMode) ?? PERMISSION_MODES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={TOOLBAR_BTN}
          disabled={disabled}
          title="审批模式在 OMP 会话启动时生效"
        >
          <Shield className="size-3" />
          {selectedMode.label}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PERMISSION_MODES.map((mode) => (
          <DropdownMenuItem
            key={mode.id}
            onClick={() => onPermissionModeChange(mode.id)}
            className={mode.id === permissionMode ? "bg-accent" : ""}
          >
            {mode.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** OMP plan-mode toggle. */
function PlanModeToggle({
  planMode,
  onPlanModeChange,
  disabled,
}: {
  planMode: boolean;
  onPlanModeChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          disabled={disabled}
          onClick={() => onPlanModeChange(!planMode)}
          className={`rounded-lg font-normal ${
            planMode
              ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/15 hover:text-blue-400 dark:hover:bg-blue-500/15"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          }`}
        >
          <Map className="size-3" />
          计划
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{planMode ? "退出计划模式" : "进入计划模式（先规划再执行）"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export interface EngineControlsProps {
  isProcessing: boolean;
  disabled?: boolean;
  permissionMode: string;
  onPermissionModeChange: (mode: string) => void;
  planMode: boolean;
  onPlanModeChange: (enabled: boolean) => void;
}

/** Renders OMP plan and approval controls. */
export function EngineControls({
  isProcessing,
  disabled,
  permissionMode,
  onPermissionModeChange,
  planMode,
  onPlanModeChange,
}: EngineControlsProps) {
  const controlsDisabled = disabled || isProcessing;
  return (
    <>
      <PlanModeToggle
        planMode={planMode}
        onPlanModeChange={onPlanModeChange}
        disabled={controlsDisabled}
      />
      <PermissionDropdown
        permissionMode={permissionMode}
        onPermissionModeChange={onPermissionModeChange}
        disabled={controlsDisabled}
      />
    </>
  );
}
