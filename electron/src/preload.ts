import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

interface PreloadDocument {
  documentElement: {
    classList: {
      add: (token: string) => void;
    };
  };
}

interface PreloadStorage {
  getItem: (key: string) => string | null;
}

interface PreloadGlobals {
  document?: PreloadDocument;
  localStorage?: PreloadStorage;
}

import type { ThemeOption as ThemeSource, MacBackgroundEffect } from "@shared/types/settings";
import type { OmpExitEvent, OmpRpcCommand, OmpSessionFrame, OmpStartOptions, OmpStderrEvent } from "@shared/types/omp";

function readStoredThemeSource(storage: PreloadStorage | undefined): ThemeSource {
  const stored = storage?.getItem("harnss-theme");
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "dark";
}

// Early setup wrapped in try/catch so contextBridge.exposeInMainWorld always runs
// even if DOM isn't ready or something else fails above it.
try {
  const globals = globalThis as typeof globalThis & PreloadGlobals;
  const root = globals.document?.documentElement;
  const themeSource = readStoredThemeSource(globals.localStorage);

  // Apply platform + glass classes as early as possible (before React mounts).
  // On Windows, glass support does not mean the user has transparency enabled.
  root?.classList.add(`platform-${process.platform}`);
  ipcRenderer.send("app:set-theme-source", themeSource);
  const transparencyEnabled = (globals.localStorage?.getItem("harnss-transparency") ?? null) !== "false";
  const canUseTransparentWindow = process.platform === "darwin" || process.platform === "win32";
  if (canUseTransparentWindow && transparencyEnabled) {
    root?.classList.add("glass-enabled");
  }

  // Push stored theme to main process early so glass appearance is correct
  // before React mounts. Default to "dark" to match useSettings, which falls
  // back to "dark" when harnss-theme is unset — avoids a system→dark flash.
  const storedTheme = globals.localStorage?.getItem("harnss-theme");
  if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
    ipcRenderer.send("glass:set-theme", storedTheme);
  } else {
    ipcRenderer.send("glass:set-theme", "dark");
  }
} catch (e) {
  console.error("[preload] early setup failed:", e);
}

contextBridge.exposeInMainWorld("claude", {
  getGlassSupported: () => ipcRenderer.invoke("app:getGlassSupported"),
  getMacBackgroundEffectSupport: () => ipcRenderer.invoke("app:get-mac-background-effect-support"),
  setThemeSource: (themeSource: ThemeSource) => ipcRenderer.send("app:set-theme-source", themeSource),
  setMacBackgroundEffect: (effect: MacBackgroundEffect) => ipcRenderer.send("app:set-mac-background-effect", effect),
  relaunchApp: () => ipcRenderer.invoke("app:relaunch"),
  setMinWidth: (width: number) => ipcRenderer.send("app:set-min-width", width),
  glass: {
    setTintColor: (tintColor: string | null) =>
      ipcRenderer.send("glass:set-tint-color", tintColor),
    setTheme: (theme: string) =>
      ipcRenderer.send("glass:set-theme", theme),
  },
  omp: {
    start: (options: OmpStartOptions) => ipcRenderer.invoke("omp:start", options),
    restart: (sessionId: string) => ipcRenderer.invoke("omp:restart", sessionId),
    command: (sessionId: string, command: OmpRpcCommand) =>
      ipcRenderer.invoke("omp:command", sessionId, command),
    stop: (sessionId: string) => ipcRenderer.invoke("omp:stop", sessionId),
    onEvent: (callback: (data: OmpSessionFrame) => void) => {
      const listener = (_event: IpcRendererEvent, data: OmpSessionFrame) => callback(data);
      ipcRenderer.on("omp:event", listener);
      return () => ipcRenderer.removeListener("omp:event", listener);
    },
    onStderr: (callback: (data: OmpStderrEvent) => void) => {
      const listener = (_event: IpcRendererEvent, data: OmpStderrEvent) => callback(data);
      ipcRenderer.on("omp:stderr", listener);
      return () => ipcRenderer.removeListener("omp:stderr", listener);
    },
    onExit: (callback: (data: OmpExitEvent) => void) => {
      const listener = (_event: IpcRendererEvent, data: OmpExitEvent) => callback(data);
      ipcRenderer.on("omp:exit", listener);
      return () => ipcRenderer.removeListener("omp:exit", listener);
    },
  },
  readFile: (filePath: string) => ipcRenderer.invoke("file:read", filePath),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke("file:rename", { oldPath, newPath }),
  trashItem: (filePath: string) => ipcRenderer.invoke("file:trash", filePath),
  newFile: (filePath: string) => ipcRenderer.invoke("file:new-file", filePath),
  newFolder: (folderPath: string) => ipcRenderer.invoke("file:new-folder", folderPath),
  writeClipboardText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text),
  setBrowserColorScheme: (targetWebContentsId: number, colorScheme: "light" | "dark") =>
    ipcRenderer.invoke("browser:set-color-scheme", { targetWebContentsId, colorScheme }),
  openInEditor: (filePath: string, line?: number, editor?: string) => ipcRenderer.invoke("file:open-in-editor", { filePath, line, editor }),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke("shell:show-item-in-folder", filePath),
  generateTitle: (message: string, cwd?: string, engine?: string, sessionId?: string) =>
    ipcRenderer.invoke("omp:generate-title", { message, cwd, engine, sessionId }),
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (spaceId?: string) => ipcRenderer.invoke("projects:create", spaceId),
    createDev: (name: string, spaceId?: string) => ipcRenderer.invoke("projects:create-dev", name, spaceId),
    delete: (projectId: string) => ipcRenderer.invoke("projects:delete", projectId),
    rename: (projectId: string, name: string) => ipcRenderer.invoke("projects:rename", projectId, name),
    updateSpace: (projectId: string, spaceId: string) => ipcRenderer.invoke("projects:update-space", projectId, spaceId),
    updateIcon: (projectId: string, icon: string | null, iconType: "emoji" | "lucide" | null) => ipcRenderer.invoke("projects:update-icon", projectId, icon, iconType),
    reorder: (projectId: string, targetProjectId: string) => ipcRenderer.invoke("projects:reorder", projectId, targetProjectId),
  },
  sessions: {
    save: (data: unknown) => ipcRenderer.invoke("sessions:save", data),
    load: (projectId: string, sessionId: string) => ipcRenderer.invoke("sessions:load", projectId, sessionId),
    list: (projectId: string) => ipcRenderer.invoke("sessions:list", projectId),
    delete: (projectId: string, sessionId: string) => ipcRenderer.invoke("sessions:delete", projectId, sessionId),
    search: (projectIds: string[], query: string) => ipcRenderer.invoke("sessions:search", { projectIds, query }),
    updateMeta: (projectId: string, sessionId: string, patch: { pinned?: boolean; folderId?: string | null; branch?: string }) =>
      ipcRenderer.invoke("sessions:update-meta", { projectId, sessionId, patch }),
  },
  folders: {
    list: (projectId: string) => ipcRenderer.invoke("folders:list", projectId),
    create: (projectId: string, name: string) => ipcRenderer.invoke("folders:create", { projectId, name }),
    delete: (projectId: string, folderId: string) => ipcRenderer.invoke("folders:delete", { projectId, folderId }),
    rename: (projectId: string, folderId: string, name: string) => ipcRenderer.invoke("folders:rename", { projectId, folderId, name }),
    pin: (projectId: string, folderId: string, pinned: boolean) => ipcRenderer.invoke("folders:pin", { projectId, folderId, pinned }),
  },
  spaces: {
    list: () => ipcRenderer.invoke("spaces:list"),
    save: (spaces: unknown) => ipcRenderer.invoke("spaces:save", spaces),
  },
  ccSessions: {
    list: (projectPath: string) => ipcRenderer.invoke("cc-sessions:list", projectPath),
    import: (projectPath: string, ccSessionId: string) => ipcRenderer.invoke("cc-sessions:import", projectPath, ccSessionId),
  },
  files: {
    list: (cwd: string) => ipcRenderer.invoke("files:list", cwd),
    listAll: (cwd: string) => ipcRenderer.invoke("files:list-all", cwd),
    watch: (cwd: string) => ipcRenderer.invoke("files:watch", cwd),
    unwatch: (cwd: string) => ipcRenderer.invoke("files:unwatch", cwd),
    calculateDeepSize: (cwd: string, paths: string[]) => ipcRenderer.invoke("files:calculate-deep-size", { cwd, paths }),
    readMultiple: (cwd: string, paths: string[], deepPaths?: Set<string>) => ipcRenderer.invoke("files:read-multiple", { cwd, paths, deepPaths: deepPaths ? Array.from(deepPaths) : undefined }),
    onChanged: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("files:changed", listener);
      return () => ipcRenderer.removeListener("files:changed", listener);
    },
  },
  git: {
    discoverRepos: (projectPath: string) => ipcRenderer.invoke("git:discover-repos", projectPath),
    status: (cwd: string) => ipcRenderer.invoke("git:status", cwd),
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke("git:stage", { cwd, files }),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke("git:unstage", { cwd, files }),
    stageAll: (cwd: string) => ipcRenderer.invoke("git:stage-all", cwd),
    unstageAll: (cwd: string) => ipcRenderer.invoke("git:unstage-all", cwd),
    discard: (cwd: string, files: string[]) => ipcRenderer.invoke("git:discard", { cwd, files }),
    commit: (cwd: string, message: string) => ipcRenderer.invoke("git:commit", { cwd, message }),
    branches: (cwd: string) => ipcRenderer.invoke("git:branches", cwd),
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke("git:checkout", { cwd, branch }),
    createBranch: (cwd: string, name: string) => ipcRenderer.invoke("git:create-branch", { cwd, name }),
    createWorktree: (cwd: string, path: string, branch: string, fromRef?: string) => ipcRenderer.invoke("git:create-worktree", { cwd, path, branch, fromRef }),
    removeWorktree: (cwd: string, path: string, force?: boolean) => ipcRenderer.invoke("git:remove-worktree", { cwd, path, force }),
    pruneWorktrees: (cwd: string) => ipcRenderer.invoke("git:prune-worktrees", cwd),
    push: (cwd: string) => ipcRenderer.invoke("git:push", cwd),
    pull: (cwd: string) => ipcRenderer.invoke("git:pull", cwd),
    fetch: (cwd: string) => ipcRenderer.invoke("git:fetch", cwd),
    diffFile: (cwd: string, file: string, staged: boolean) => ipcRenderer.invoke("git:diff-file", { cwd, file, staged }),
    diffStat: (cwd: string) => ipcRenderer.invoke("git:diff-stat", cwd) as Promise<{ additions: number; deletions: number }>,
    log: (cwd: string, count?: number) => ipcRenderer.invoke("git:log", { cwd, count }),
    generateCommitMessage: (cwd: string, engine?: string, sessionId?: string) =>
      ipcRenderer.invoke("git:generate-commit-message", { cwd, engine, sessionId }),
  },
  terminal: {
    create: (options: { cwd?: string; cols?: number; rows?: number; spaceId?: string }) => ipcRenderer.invoke("terminal:create", options),
    list: () => ipcRenderer.invoke("terminal:list"),
    snapshot: (terminalId: string) => ipcRenderer.invoke("terminal:snapshot", terminalId),
    write: (terminalId: string, data: string) => ipcRenderer.invoke("terminal:write", { terminalId, data }),
    resize: (terminalId: string, cols: number, rows: number) => ipcRenderer.invoke("terminal:resize", { terminalId, cols, rows }),
    destroy: (terminalId: string) => ipcRenderer.invoke("terminal:destroy", terminalId),
    destroySpace: (spaceId: string) => ipcRenderer.invoke("terminal:destroy-space", spaceId),
    onData: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("terminal:data", listener);
      return () => ipcRenderer.removeListener("terminal:data", listener);
    },
    onExit: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("terminal:exit", listener);
      return () => ipcRenderer.removeListener("terminal:exit", listener);
    },
  },
  mcp: {
    list: (cwd: string) => ipcRenderer.invoke("mcp:list", cwd),
    add: (cwd: string, server: unknown) => ipcRenderer.invoke("mcp:add", cwd, server),
    remove: (cwd: string, name: string) => ipcRenderer.invoke("mcp:remove", cwd, name),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke("settings:set", patch),
    onChanged: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on("settings:changed", listener);
      return () => ipcRenderer.removeListener("settings:changed", listener);
    },
  },
  jira: {
    getConfig: (projectId: string) => ipcRenderer.invoke("jira:get-config", projectId),
    saveConfig: (projectId: string, config: unknown) =>
      ipcRenderer.invoke("jira:save-config", { projectId, config }),
    deleteConfig: (projectId: string) => ipcRenderer.invoke("jira:delete-config", projectId),
    authenticate: (instanceUrl: string, method: "oauth" | "apitoken", apiToken?: string, email?: string) =>
      ipcRenderer.invoke("jira:authenticate", { instanceUrl, method, apiToken, email }),
    authStatus: (instanceUrl: string) => ipcRenderer.invoke("jira:auth-status", instanceUrl),
    logout: (instanceUrl: string) => ipcRenderer.invoke("jira:logout", instanceUrl),
    getProjects: (instanceUrl: string) => ipcRenderer.invoke("jira:get-projects", instanceUrl),
    getBoards: (params: { instanceUrl: string; projectKey?: string }) =>
      ipcRenderer.invoke("jira:get-boards", params),
    getBoardConfiguration: (params: { instanceUrl: string; boardId: string }) =>
      ipcRenderer.invoke("jira:get-board-configuration", params),
    getSprints: (params: { instanceUrl: string; boardId: string }) =>
      ipcRenderer.invoke("jira:get-sprints", params),
    getIssues: (params: { instanceUrl: string; boardId: string; sprintId?: string; maxResults?: number }) =>
      ipcRenderer.invoke("jira:get-issues", params),
    getComments: (params: { instanceUrl: string; issueKey: string }) =>
      ipcRenderer.invoke("jira:get-comments", params),
    getTransitions: (params: { instanceUrl: string; issueKey: string }) =>
      ipcRenderer.invoke("jira:get-transitions", params),
    transitionIssue: (params: { instanceUrl: string; issueKey: string; transitionId: string }) =>
      ipcRenderer.invoke("jira:transition-issue", params),
  },
  analytics: {
    capture: (event: string, properties?: Record<string, unknown>) =>
      ipcRenderer.send("analytics:capture", event, properties),
  },
  speech: {
    startNativeDictation: () => ipcRenderer.invoke("speech:start-native-dictation"),
    getPlatform: () => ipcRenderer.invoke("speech:get-platform"),
    requestMicPermission: () => ipcRenderer.invoke("speech:request-mic-permission"),
  },
  updater: {
    onUpdateAvailable: (cb: (info: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, info: unknown) => cb(info);
      ipcRenderer.on("updater:update-available", listener);
      return () => ipcRenderer.removeListener("updater:update-available", listener);
    },
    onDownloadProgress: (cb: (progress: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, progress: unknown) => cb(progress);
      ipcRenderer.on("updater:download-progress", listener);
      return () => ipcRenderer.removeListener("updater:download-progress", listener);
    },
    onUpdateDownloaded: (cb: (info: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, info: unknown) => cb(info);
      ipcRenderer.on("updater:update-downloaded", listener);
      return () => ipcRenderer.removeListener("updater:update-downloaded", listener);
    },
    onInstallError: (cb: (error: { message: string }) => void) => {
      const listener = (_event: IpcRendererEvent, error: { message: string }) => cb(error);
      ipcRenderer.on("updater:install-error", listener);
      return () => ipcRenderer.removeListener("updater:install-error", listener);
    },
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    check: () => ipcRenderer.invoke("updater:check"),
    currentVersion: () => ipcRenderer.invoke("updater:current-version") as Promise<string>,
    isPreRelease: () => ipcRenderer.invoke("updater:is-prerelease") as Promise<{
      isPreRelease: boolean;
      version: string;
      releaseUrl: string | null;
    }>,
    onPreReleaseStatus: (cb: (info: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, info: unknown) => cb(info);
      ipcRenderer.on("updater:prerelease-status", listener);
      return () => ipcRenderer.removeListener("updater:prerelease-status", listener);
    },
  },
});
