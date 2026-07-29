import type { CCSessionInfo, ChatFolder, PersistedSession, Project, UIMessage } from "./session";
import type { Space } from "./spaces";
import type { SearchMessageResult, SearchSessionResult } from "./search";
import type { McpServerConfig } from "./mcp";
import type { GitRepoInfo, GitStatus, GitBranch, GitLogEntry } from "@shared/types/git";
import type { AppSettings, MacBackgroundEffect, ThemeOption } from "@shared/types/settings";
import type { OmpExitEvent, OmpInvokeResult, OmpRpcCommand, OmpSessionFrame, OmpStartOptions, OmpStderrEvent } from "@shared/types/omp";
import type { EngineId } from "./engine";
import type { SessionMeta as SessionListItem } from "@shared/lib/session-persistence";
import type {
  JiraProjectConfig,
  JiraBoard,
  JiraIssue,
  JiraSprint,
  JiraComment,
  JiraTransition,
  JiraBoardConfiguration,
  JiraProjectSummary,
  JiraGetBoardsParams,
  JiraGetIssuesParams,
  JiraGetSprintsParams,
  JiraGetCommentsParams,
  JiraGetTransitionsParams,
  JiraTransitionIssueParams,
} from "@shared/types/jira";

/** Standard IPC result envelope — most IPC calls return this shape. */
interface IpcResult {
  ok?: boolean;
  error?: string;
}


declare global {
  /** Result of the GitHub pre-release check for the running version. */
  interface PreReleaseInfo {
    isPreRelease: boolean;
    version: string;
    releaseUrl: string | null;
  }

  interface Window {
    claude: {
      getGlassSupported: () => Promise<boolean>;
      getMacBackgroundEffectSupport: () => Promise<{ liquidGlass: boolean; vibrancy: boolean }>;
      setThemeSource: (themeSource: ThemeOption) => void;
      setMacBackgroundEffect: (effect: MacBackgroundEffect) => void;
      relaunchApp: () => Promise<IpcResult>;
      setMinWidth: (width: number) => void;
      glass: {
        setTintColor: (tintColor: string | null) => void;
        setTheme: (theme: "light" | "dark" | "system") => void;
      };
      omp: {
        start: (options: OmpStartOptions) => Promise<OmpInvokeResult>;
        restart: (sessionId: string) => Promise<OmpInvokeResult>;
        command: (sessionId: string, command: OmpRpcCommand) => Promise<OmpInvokeResult>;
        stop: (sessionId: string) => Promise<OmpInvokeResult>;
        onEvent: (callback: (data: OmpSessionFrame) => void) => () => void;
        onStderr: (callback: (data: OmpStderrEvent) => void) => () => void;
        onExit: (callback: (data: OmpExitEvent) => void) => () => void;
      };
      readFile: (filePath: string) => Promise<{ content?: string; error?: string }>;
      renameFile: (oldPath: string, newPath: string) => Promise<IpcResult>;
      trashItem: (filePath: string) => Promise<IpcResult>;
      newFile: (filePath: string) => Promise<IpcResult>;
      newFolder: (folderPath: string) => Promise<IpcResult>;
      writeClipboardText: (text: string) => Promise<IpcResult>;
      setBrowserColorScheme: (
        targetWebContentsId: number,
        colorScheme: "light" | "dark",
      ) => Promise<IpcResult>;
      openInEditor: (filePath: string, line?: number, editor?: string) => Promise<IpcResult & { editor?: string }>;
      openExternal: (url: string) => Promise<IpcResult>;
      showItemInFolder: (filePath: string) => Promise<IpcResult>;
      generateTitle: (
        message: string,
        cwd?: string,
        engine?: EngineId,
        sessionId?: string,
      ) => Promise<{ title?: string; error?: string }>;
      projects: {
        list: () => Promise<Project[]>;
        create: (spaceId?: string) => Promise<Project | null>;
        createDev: (name: string, spaceId?: string) => Promise<Project | null>;
        delete: (projectId: string) => Promise<IpcResult>;
        rename: (projectId: string, name: string) => Promise<IpcResult>;
        updateSpace: (projectId: string, spaceId: string) => Promise<IpcResult>;
        updateIcon: (projectId: string, icon: string | null, iconType: "emoji" | "lucide" | null) => Promise<IpcResult>;
        reorder: (projectId: string, targetProjectId: string) => Promise<IpcResult>;
      };
      sessions: {
        save: (data: PersistedSession) => Promise<IpcResult>;
        load: (projectId: string, sessionId: string) => Promise<PersistedSession | null>;
        list: (projectId: string) => Promise<SessionListItem[]>;
        delete: (projectId: string, sessionId: string) => Promise<IpcResult>;
        search: (projectIds: string[], query: string) => Promise<{
          messageResults: SearchMessageResult[];
          sessionResults: SearchSessionResult[];
        }>;
        updateMeta: (projectId: string, sessionId: string, patch: {
          pinned?: boolean;
          folderId?: string | null;
          branch?: string;
        }) => Promise<IpcResult>;
      };
      folders: {
        list: (projectId: string) => Promise<ChatFolder[]>;
        create: (projectId: string, name: string) => Promise<ChatFolder>;
        delete: (projectId: string, folderId: string) => Promise<IpcResult>;
        rename: (projectId: string, folderId: string, name: string) => Promise<IpcResult>;
        pin: (projectId: string, folderId: string, pinned: boolean) => Promise<IpcResult>;
      };
      spaces: {
        list: () => Promise<Space[]>;
        save: (spaces: Space[]) => Promise<IpcResult>;
      };
      ccSessions: {
        list: (projectPath: string) => Promise<CCSessionInfo[]>;
        import: (projectPath: string, ccSessionId: string) => Promise<{
          messages?: UIMessage[];
          ccSessionId?: string;
          error?: string;
        }>;
      };
      files: {
        list: (cwd: string) => Promise<{ files: string[]; dirs: string[] }>;
        listAll: (cwd: string) => Promise<{ files: string[]; dirs: string[] }>;
        watch: (cwd: string) => Promise<IpcResult>;
        unwatch: (cwd: string) => Promise<IpcResult>;
        calculateDeepSize: (
          cwd: string,
          paths: string[],
        ) => Promise<{
          totalSize: number;
          fileCount: number;
          estimatedTokens: number;
          warnings: string[];
        }>;
        readMultiple: (
          cwd: string,
          paths: string[],
          deepPaths?: Set<string>,
        ) => Promise<
          Array<
            | { path: string; content: string; isDir?: false; error?: undefined }
            | { path: string; isDir: true; tree: string; error?: undefined }
            | { path: string; error: string; content?: undefined; isDir?: undefined }
          >
        >;
        onChanged: (callback: (data: { cwd: string }) => void) => () => void;
      };
      git: {
        discoverRepos: (projectPath: string) => Promise<GitRepoInfo[]>;
        status: (cwd: string) => Promise<GitStatus | { error: string }>;
        stage: (cwd: string, files: string[]) => Promise<IpcResult>;
        unstage: (cwd: string, files: string[]) => Promise<IpcResult>;
        stageAll: (cwd: string) => Promise<IpcResult>;
        unstageAll: (cwd: string) => Promise<IpcResult>;
        discard: (cwd: string, files: string[]) => Promise<IpcResult>;
        commit: (cwd: string, message: string) => Promise<IpcResult & { output?: string }>;
        branches: (cwd: string) => Promise<GitBranch[] | { error: string }>;
        checkout: (cwd: string, branch: string) => Promise<IpcResult>;
        createBranch: (cwd: string, name: string) => Promise<IpcResult>;
        createWorktree: (cwd: string, path: string, branch: string, fromRef?: string) => Promise<IpcResult & { path?: string; output?: string; setupResults?: Array<{ command: string; ok: boolean; output?: string; error?: string }> }>;
        removeWorktree: (cwd: string, path: string, force?: boolean) => Promise<IpcResult & { output?: string }>;
        pruneWorktrees: (cwd: string) => Promise<IpcResult & { output?: string }>;
        push: (cwd: string) => Promise<IpcResult & { output?: string }>;
        pull: (cwd: string) => Promise<IpcResult & { output?: string }>;
        fetch: (cwd: string) => Promise<IpcResult & { output?: string }>;
        diffFile: (cwd: string, file: string, staged: boolean) => Promise<{ diff?: string; error?: string }>;
        diffStat: (cwd: string) => Promise<{ additions: number; deletions: number }>;
        log: (cwd: string, count?: number) => Promise<GitLogEntry[] | { error: string }>;
        generateCommitMessage: (
          cwd: string,
          engine?: EngineId,
          sessionId?: string,
        ) => Promise<{ message?: string; error?: string }>;
      };
      terminal: {
        create: (options: { cwd?: string; cols?: number; rows?: number; spaceId?: string }) => Promise<{ terminalId?: string; error?: string }>;
        list: () => Promise<{
          terminals?: Array<{
            terminalId: string;
            spaceId: string;
            createdAt: number;
            exited: boolean;
            exitCode: number | null;
          }>;
          error?: string;
        }>;
        snapshot: (terminalId: string) => Promise<{
          output?: string;
          seq?: number;
          cols?: number;
          rows?: number;
          exited?: boolean;
          exitCode?: number | null;
          error?: string;
        }>;
        write: (terminalId: string, data: string) => Promise<IpcResult>;
        resize: (terminalId: string, cols: number, rows: number) => Promise<IpcResult>;
        destroy: (terminalId: string) => Promise<{ ok?: boolean }>;
        destroySpace: (spaceId: string) => Promise<{ ok?: boolean }>;
        onData: (callback: (data: { terminalId: string; data: string; seq: number }) => void) => () => void;
        onExit: (callback: (data: { terminalId: string; exitCode: number }) => void) => () => void;
      };
      mcp: {
        list: (cwd: string) => Promise<McpServerConfig[]>;
        add: (cwd: string, server: McpServerConfig) => Promise<IpcResult>;
        remove: (cwd: string, name: string) => Promise<IpcResult>;
      };
      settings: {
        get: () => Promise<AppSettings>;
        set: (patch: Partial<AppSettings>) => Promise<IpcResult>;
        /** Subscribe to settings changes pushed from the main process. */
        onChanged: (callback: (settings: AppSettings) => void) => () => void;
      };
      jira: {
        getConfig: (projectId: string) => Promise<JiraProjectConfig | null>;
        saveConfig: (projectId: string, config: JiraProjectConfig) => Promise<IpcResult>;
        deleteConfig: (projectId: string) => Promise<IpcResult>;
        authenticate: (
          instanceUrl: string,
          method: "oauth" | "apitoken",
          apiToken?: string,
          email?: string
        ) => Promise<IpcResult>;
        authStatus: (instanceUrl: string) => Promise<{ hasToken: boolean }>;
        logout: (instanceUrl: string) => Promise<IpcResult>;
        getProjects: (instanceUrl: string) => Promise<JiraProjectSummary[] | { error: string }>;
        getBoards: (params: JiraGetBoardsParams) => Promise<JiraBoard[] | { error: string }>;
        getBoardConfiguration: (params: JiraGetSprintsParams) => Promise<JiraBoardConfiguration | { error: string }>;
        getSprints: (params: JiraGetSprintsParams) => Promise<JiraSprint[] | { error: string }>;
        getIssues: (params: JiraGetIssuesParams) => Promise<JiraIssue[] | { error: string }>;
        getComments: (params: JiraGetCommentsParams) => Promise<JiraComment[] | { error: string }>;
        getTransitions: (params: JiraGetTransitionsParams) => Promise<JiraTransition[] | { error: string }>;
        transitionIssue: (params: JiraTransitionIssueParams) => Promise<IpcResult>;
      };
      analytics: {
        /** Fire-and-forget analytics event via the main process PostHog client. */
        capture: (event: string, properties?: Record<string, unknown>) => void;
      };
      speech: {
        /** Triggers macOS native dictation (Cocoa startDictation: selector). Returns { ok: false } on non-macOS. */
        startNativeDictation: () => Promise<{ ok: boolean; reason?: string }>;
        /** Returns the OS platform string (darwin, win32, linux) */
        getPlatform: () => Promise<string>;
        /** Requests microphone permission (macOS system dialog). Returns { granted } on all platforms. */
        requestMicPermission: () => Promise<{ granted: boolean }>;
      };
      updater: {
        onUpdateAvailable: (cb: (info: { version: string; releaseNotes?: string }) => void) => () => void;
        onDownloadProgress: (cb: (progress: { percent: number; bytesPerSecond: number; total: number; transferred: number }) => void) => () => void;
        onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void;
        onInstallError: (cb: (error: { message: string }) => void) => () => void;
        download: () => Promise<unknown>;
        install: () => Promise<void>;
        check: () => Promise<unknown>;
        currentVersion: () => Promise<string>;
        isPreRelease: () => Promise<PreReleaseInfo>;
        onPreReleaseStatus: (cb: (info: PreReleaseInfo) => void) => () => void;
      };
    };
  }
}
