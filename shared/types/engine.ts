/** Unified slash command representation for OMP and local UI commands. */
export interface SlashCommand {
  /** The command string without leading slash (e.g., "compact", "help"). */
  name: string;
  /** Human-readable description shown in the autocomplete popup. */
  description: string;
  /** Placeholder hint for arguments (e.g., "<query>"), shown grayed after the command name. */
  argumentHint?: string;
  /** Command origin used for execution routing. */
  source: "omp" | "local";
  /** Optional text inserted after the command name. */
  defaultPrompt?: string;
  /** Optional command-name override for command-specific syntax. */
  appSlug?: string;
  /** Optional icon URL for the autocomplete popup. */
  iconUrl?: string;
}

/** The only supported runtime identifier. */
export type EngineId = "omp";

/**
 * Permission response behaviors.
 * - "allow": accept the tool call once
 * - "deny": reject the tool call
 * - "allowForSession": accept and allow similar calls for the rest of the session
 */
export type AppPermissionBehavior = "allow" | "deny" | "allowForSession";

/**
 * Canonical signature for responding to a tool permission prompt.
 * All engines must implement this — unused params can be ignored.
 *
 * `updatedPermissions` is forwarded to the SDK to persist allow rules
 * to the chosen settings file (session / local / project / user).
 */
export type RespondPermissionFn = (
  behavior: AppPermissionBehavior,
  updatedInput?: Record<string, unknown>,
  newPermissionMode?: string,
  updatedPermissions?: unknown[],
) => Promise<void>;
