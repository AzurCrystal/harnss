import type { ChatFolder, ChatSession } from "@/types";
import type { FolderSidebarItem } from "@/lib/sidebar/grouping";
import { SessionItem } from "./SessionItem";
import { FolderSection } from "./FolderSection";
import { useSidebarActions } from "./SidebarActionsContext";

export function PinnedSection({
  sessions,
  pinnedFolders,
  activeSessionId,
  islandLayout,
  folders,
}: {
  sessions: ChatSession[];
  pinnedFolders?: FolderSidebarItem[];
  activeSessionId: string | null;
  islandLayout: boolean;
  folders: ChatFolder[];
}) {
  const {
    selectSession,
    deleteSession,
    renameSession,
    pinSession,
    moveSessionToFolder,
    pinFolder,
    renameFolder,
    deleteFolder,
    openInSplitView,
    canOpenSessionInSplitView,
  } = useSidebarActions();
  if (sessions.length === 0 && (!pinnedFolders || pinnedFolders.length === 0)) return null;

  return (
    <div className="mb-2">
      {pinnedFolders?.map((item) => {
        const { folder } = item;
        return (
          <FolderSection
            key={`folder-${folder.id}`}
            folder={folder}
            sessions={item.sessions}
            activeSessionId={activeSessionId}
            islandLayout={islandLayout}
            allFolders={folders}
            onPinFolder={(pinned) => pinFolder(folder.projectId, folder.id, pinned)}
            onRenameFolder={(name) => renameFolder(folder.projectId, folder.id, name)}
            onDeleteFolder={() => deleteFolder(folder.projectId, folder.id)}
          />
        );
      })}
      {sessions.map((session) => (
        <SessionItem
          key={session.id}
          islandLayout={islandLayout}
          session={session}
          isActive={session.id === activeSessionId}
          onSelect={() => selectSession(session.id)}
          onDelete={() => deleteSession(session.id)}
          onRename={(title) => renameSession(session.id, title)}
          onPinToggle={() => pinSession(session.id, false)}
          folders={folders}
          onMoveToFolder={(folderId) => moveSessionToFolder(session.id, folderId)}
          onOpenInSplitView={openInSplitView ? () => openInSplitView(session.id) : undefined}
          canOpenInSplitView={canOpenSessionInSplitView?.(session.id) ?? true}
        />
      ))}
    </div>
  );
}
