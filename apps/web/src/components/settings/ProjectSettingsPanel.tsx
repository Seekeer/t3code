import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  settlePromise,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { isMissingDirectoryBrowseError } from "@t3tools/client-runtime/state/filesystem";
import { AsyncResult } from "effect/unstable/reactivity";
import { type EnvironmentId, type ProjectIconOverride } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import { FolderIcon, InfoIcon, Trash2Icon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { releaseProjectDraftUploads } from "../../lib/composerDraftUploads";
import { readLocalApi } from "../../localApi";
import { browsePlatformFromOs } from "../../lib/utils";
import {
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useThreadShells } from "../../state/entities";
import { filesystemEnvironment } from "../../state/filesystem";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { ensureBrowseDirectoryPath } from "../../lib/projectPaths";
import { ProjectFavicon } from "../ProjectFavicon";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import {
  canPickExternalProjectFavicon,
  ProjectFaviconPickerDialog,
} from "./ProjectFaviconPickerDialog";
import { ProjectFolderPickerDialog } from "./ProjectFolderPickerDialog";
import { workspaceRootFailureMessage } from "./ProjectFolderPickerDialog.logic";
import { ProjectActionsSettings } from "./ProjectActionsSettings";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import { projectGroupTitleNeedsUpdate } from "./ProjectSettingsPanel.logic";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";

const ProjectIconPickerDialog = lazy(() =>
  import("./ProjectIconPickerDialog").then((module) => ({
    default: module.ProjectIconPickerDialog,
  })),
);

function memberKey(member: { environmentId: string; id: string }): string {
  return `${member.environmentId}:${member.id}`;
}

/** `project` is the Projects page shortcut: the new-thread defaults people change most. */
export type ProjectSettingsCategory = "general" | "integrations" | "source-control" | "project";

export function ProjectSettingsPanel({
  projectKey,
  environmentId = null,
  checkoutKey = null,
}: {
  projectKey: string;
  environmentId?: EnvironmentId | null;
  checkoutKey?: string | null;
}) {
  const groups = useSettingsProjectGroups();
  const navigate = useNavigate({ from: "/settings" });
  const pathname = useLocation({ select: (location) => location.pathname });

  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;
  const members = useMemo(
    () =>
      selected?.memberProjects.filter(
        (member) =>
          (environmentId === null || member.environmentId === environmentId) &&
          (checkoutKey === null || member.physicalProjectKey === checkoutKey),
      ) ?? [],
    [selected, environmentId, checkoutKey],
  );

  // Remember the members of the last rendered group so a change that replaces
  // the group key mid-visit (a grouping rule, or a folder change) can follow
  // the project to its new group. Members are remembered by id, not by the
  // path-derived physical key: changing a project's folder changes that key,
  // and the project must still be found afterwards.
  const lastSelectionRef = useRef<{ key: string; memberIds: string[] } | null>(null);
  useEffect(() => {
    if (!selected || members.length === 0) return;
    lastSelectionRef.current = {
      key: selected.projectKey,
      memberIds: selected.memberProjects.map((member) => memberKey(member)),
    };
  }, [selected, members, environmentId, checkoutKey]);

  // A grouping-rule or folder change replaces the group key mid-visit; follow
  // the project to its new key instead of parking on the not-found state.
  useEffect(() => {
    if (members.length > 0) return;
    const last = lastSelectionRef.current;
    if (last?.key !== projectKey) return;
    const memberIds = new Set(last.memberIds);
    const successor = groups.find((group) =>
      group.memberProjects.some((member) => memberIds.has(memberKey(member))),
    );
    if (successor) {
      // A checkout narrowing is a physical key, and a folder change replaces
      // it. Carry the successor's own key over so the panel stays on the
      // checkout the user was editing.
      const successorMember = successor.memberProjects.find((member) =>
        memberIds.has(memberKey(member)),
      );
      void navigate({
        to: pathname,
        search: () => ({
          project: successor.projectKey,
          machine: environmentId ?? undefined,
          checkout:
            checkoutKey === null ? undefined : (successorMember?.physicalProjectKey ?? undefined),
        }),
        replace: true,
        hashScrollIntoView: false,
      });
    }
  }, [groups, navigate, pathname, projectKey, members.length, environmentId, checkoutKey]);

  // A folder change replaces the group key, which remounts ProjectDetail. The
  // path it replaced has to outlive that remount or there would be no way back.
  const [previousWorkspaceRootByProjectId, setPreviousWorkspaceRootByProjectId] = useState<
    Readonly<Record<string, string>>
  >({});
  const rememberPreviousWorkspaceRoot = useCallback((projectId: string, previousPath: string) => {
    setPreviousWorkspaceRootByProjectId((current) => ({ ...current, [projectId]: previousPath }));
  }, []);

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {groups.length === 0
          ? "Add a project from the sidebar to configure it here."
          : "This project is no longer available."}
      </div>
    );
  }
  if (members.length === 0)
    return (
      <p className="p-8 text-sm text-muted-foreground">
        This checkout is no longer available in the selected project and environment.
      </p>
    );
  const scopedGroup = {
    ...selected,
    memberProjects: members,
    environmentId: members[0]!.environmentId,
    id: members[0]!.id,
  };
  return (
    <ProjectDetail
      key={`${selected.projectKey}:${environmentId ?? "all"}:${checkoutKey ?? "all"}`}
      group={scopedGroup}
      hasOtherMembers={members.length < selected.memberProjects.length}
      previousWorkspaceRootByProjectId={previousWorkspaceRootByProjectId}
      onWorkspaceRootChanged={rememberPreviousWorkspaceRoot}
    />
  );
}

function ProjectDetail(props: {
  readonly group: SidebarProjectSnapshot;
  readonly hasOtherMembers: boolean;
  readonly previousWorkspaceRootByProjectId: Readonly<Record<string, string>>;
  readonly onWorkspaceRootChanged: (projectId: string, previousPath: string) => void;
}) {
  const { group, hasOtherMembers } = props;
  const navigate = useNavigate({ from: "/settings" });
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentById = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );
  const representative =
    group.memberProjects.find(
      (member) => environmentById.get(member.environmentId)?.serverConfig != null,
    ) ?? group.memberProjects[0]!;
  const threads = useThreadShells();
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const deleteProject = useAtomCommand(projectEnvironment.delete, { reportFailure: false });
  const projectNameEditedRef = useRef(false);

  const faviconPath = representative.faviconPath ?? null;
  const projectIcon = representative.projectIcon ?? null;
  const pickProjectFavicon =
    typeof window !== "undefined" &&
    group.memberProjects.every(
      (member) =>
        member.environmentId === primaryEnvironmentId &&
        canPickExternalProjectFavicon(member.workspaceRoot, navigator.platform),
    )
      ? window.desktopBridge?.pickProjectFavicon
      : undefined;

  const reportFailure = useCallback(
    (title: string, result: AtomCommandResult<void, unknown>, description?: string | null) => {
      if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title,
          description:
            description ?? (error instanceof Error ? error.message : "An error occurred."),
        }),
      );
    },
    [],
  );

  // Group-shared fields live on each physical project record, so a
  // group-level edit fans out to every member.
  const updateAllMembers = useCallback(
    async (
      input: Partial<{
        title: string;
        faviconPath: string | null;
        projectIcon: ProjectIconOverride | null;
      }>,
      failureTitle: string,
    ): Promise<AtomCommandResult<void, unknown>> => {
      const unavailable = group.memberProjects.find((member) => {
        const environment = environmentById.get(member.environmentId);
        return environment?.connection.phase !== "connected" || !environment.serverConfig;
      });
      if (unavailable) {
        const error = new Error(
          `Connect ${unavailable.environmentLabel ?? "the selected environment"} and try again.`,
        );
        const result: AtomCommandResult<void, unknown> = AsyncResult.failure(Cause.fail(error));
        reportFailure(failureTitle, result);
        return result;
      }
      for (const member of group.memberProjects) {
        const result = mapAtomCommandResult(
          await updateProject({
            environmentId: member.environmentId,
            input: { projectId: member.id, ...input },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          // A partial fan-out is possible: earlier members already took the
          // write. Name the environment so the user knows where it stopped.
          reportFailure(
            group.memberProjects.length > 1
              ? `${failureTitle} on ${member.environmentLabel ?? "the current environment"}`
              : failureTitle,
            result,
          );
          return result;
        }
      }
      return AsyncResult.success(undefined);
    },
    [environmentById, group.memberProjects, reportFailure, updateProject],
  );

  const renameGroup = useCallback(
    async (nextTitle: string, wasEdited: boolean) => {
      const title = nextTitle.trim();
      if (!title) {
        toastManager.add({ type: "warning", title: "Project title cannot be empty" });
        return;
      }
      if (
        !projectGroupTitleNeedsUpdate(
          group.memberProjects.map((member) => member.title),
          title,
          wasEdited,
        )
      ) {
        return;
      }
      await updateAllMembers({ title }, "Failed to rename project");
    },
    [group.memberProjects, updateAllMembers],
  );

  // ----- project icon -----
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const savingFaviconRef = useRef(false);
  const setProjectIcon = useCallback(
    async (input: { faviconPath: string | null; projectIcon: ProjectIconOverride | null }) => {
      if (savingFaviconRef.current) return;
      savingFaviconRef.current = true;
      setIsSavingFavicon(true);
      try {
        await updateAllMembers(input, "Failed to update project icon");
      } finally {
        savingFaviconRef.current = false;
        setIsSavingFavicon(false);
      }
    },
    [updateAllMembers],
  );

  const hasMultipleCheckouts = group.memberProjects.length > 1;

  const removeMembers = useCallback(
    async (members: ReadonlyArray<SidebarProjectGroupMember>) => {
      const api = readLocalApi();
      if (!api) return;

      const memberKeys = new Set(members.map(memberKey));
      const projectThreads = threads.filter((thread) =>
        memberKeys.has(`${thread.environmentId}:${thread.projectId}`),
      );
      const isWholeGroup = members.length === group.memberProjects.length;
      const targetKind = hasOtherMembers || !isWholeGroup ? "checkout" : "project";
      const singleMember = members.length === 1 ? members[0]! : null;
      const targetLabel = singleMember?.title ?? group.displayName;
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm(
          [
            projectThreads.length > 0
              ? `Remove ${targetKind} "${targetLabel}" and delete its ${projectThreads.length} thread${projectThreads.length === 1 ? "" : "s"}?`
              : `Remove ${targetKind} "${targetLabel}"?`,
            ...(singleMember
              ? [
                  `Path: ${singleMember.workspaceRoot}`,
                  ...(singleMember.environmentLabel
                    ? [`Environment: ${singleMember.environmentLabel}`]
                    : []),
                ]
              : [`This removes ${members.length} grouped project entries.`]),
            ...(projectThreads.length > 0
              ? [
                  "This permanently clears conversation history for those threads and any archived threads.",
                ]
              : ["This permanently clears any archived conversation history."]),
            isWholeGroup && !hasOtherMembers
              ? "This removes only the project entries, not the files on disk."
              : "Other entries in this grouped project are unaffected.",
            "This action cannot be undone.",
          ].join("\n"),
          { variant: "destructive" },
        ),
      );
      if (confirmed._tag === "Failure" || !confirmed.value) return;

      const draftStore = useComposerDraftStore.getState();
      for (const member of members) {
        const memberThreads = projectThreads.filter(
          (thread) =>
            thread.environmentId === member.environmentId && thread.projectId === member.id,
        );
        const result = mapAtomCommandResult(
          await deleteProject({
            environmentId: member.environmentId,
            input: {
              projectId: member.id,
              force: true,
            },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          reportFailure(`Failed to remove "${member.title}"`, result);
          return;
        }
        const projectRef = scopeProjectRef(member.environmentId, member.id);
        releaseProjectDraftUploads(
          projectRef,
          memberThreads.map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
        );
        const projectDraftThread = draftStore.getDraftThreadByProjectRef(projectRef);
        if (projectDraftThread) {
          draftStore.clearDraftThread(projectDraftThread.draftId);
        }
        draftStore.clearProjectDraftThreadId(projectRef);
      }

      if (isWholeGroup && !hasOtherMembers) {
        void navigate({ to: "/", replace: true });
      }
    },
    [
      deleteProject,
      group.displayName,
      group.memberProjects.length,
      hasOtherMembers,
      navigate,
      reportFailure,
      threads,
    ],
  );

  const checkoutChoices = (
    <SettingsSection title="Checkouts">
      {group.memberProjects.map((member) => (
        <SettingsRow
          key={member.physicalProjectKey}
          title={member.environmentLabel ?? "Environment"}
          description={member.workspaceRoot}
          control={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void removeMembers([member])}
              aria-label={`Remove checkout ${member.workspaceRoot}`}
            >
              Remove
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );

  return (
    <>
      <SettingsPageContainer className="gap-6">
        <Alert variant="info">
          <InfoIcon aria-hidden />
          <AlertDescription>
            Can't find a setting? Keep this project picked above and hop to any other settings page.
          </AlertDescription>
        </Alert>
        <SettingsSection id="project-overview" title="Project" hideTitle>
          <SettingsRow
            title="Name"
            description="The shared name for this project group in the sidebar and thread lists."
            control={
              <Input
                key={`${group.projectKey}:${group.displayName}`}
                size="sm"
                className="w-full sm:w-64"
                aria-label="Project name"
                defaultValue={group.displayName}
                onChange={() => {
                  projectNameEditedRef.current = true;
                }}
                onBlur={(event) => {
                  const wasEdited = projectNameEditedRef.current;
                  projectNameEditedRef.current = false;
                  void renameGroup(event.currentTarget.value, wasEdited);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            }
          />
          <SettingsRow
            title="Project icon"
            description={
              projectIcon?.kind === "lucide"
                ? `${projectIcon.name} · ${projectIcon.color}`
                : projectIcon?.kind === "monogram"
                  ? `${projectIcon.text} · ${projectIcon.color}`
                  : projectIcon?.kind === "emoji"
                    ? projectIcon.emoji
                    : (faviconPath ?? "Automatic")
            }
            resetAction={
              group.memberProjects.some(
                (member) => member.faviconPath != null || member.projectIcon != null,
              ) ? (
                <SettingResetButton
                  label="project icon"
                  disabled={isSavingFavicon}
                  onClick={() => void setProjectIcon({ faviconPath: null, projectIcon: null })}
                />
              ) : null
            }
            control={
              <div className="flex items-center gap-2">
                <ProjectFavicon project={representative} className="size-6" />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label="Choose a project icon"
                  disabled={isSavingFavicon}
                  onClick={() => setIconPickerOpen(true)}
                >
                  Choose icon
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label="Choose a project icon file"
                  disabled={isSavingFavicon}
                  onClick={() => setFaviconPickerOpen(true)}
                >
                  Choose file
                </Button>
              </div>
            }
          />
        </SettingsSection>
        <ProjectDefaultsSettings category="project" />
        <ProjectActionsSettings />
        <SettingsSection title="Folder">
          {group.memberProjects.map((member) => (
            <ProjectFolderSettings
              key={member.physicalProjectKey}
              member={member}
              projectName={group.displayName}
              previousWorkspaceRoot={
                props.previousWorkspaceRootByProjectId[memberKey(member)] ?? null
              }
              onWorkspaceRootChanged={props.onWorkspaceRootChanged}
              onChangeFolder={async (workspaceRoot) => {
                const result = mapAtomCommandResult(
                  await updateProject({
                    environmentId: member.environmentId,
                    input: { projectId: member.id, workspaceRoot },
                  }),
                  () => undefined,
                );
                if (result._tag === "Failure") {
                  const error = squashAtomCommandFailure(result);
                  reportFailure(
                    "Failed to change project folder",
                    result,
                    workspaceRootFailureMessage(error),
                  );
                  return;
                }
                props.onWorkspaceRootChanged(memberKey(member), member.workspaceRoot);
                toastManager.add({
                  type: "success",
                  title: "Folder changed",
                  description: workspaceRoot,
                });
              }}
            />
          ))}
        </SettingsSection>
        {hasMultipleCheckouts ? checkoutChoices : null}
        <SettingsSection title="Danger">
          <SettingsRow
            title={
              hasOtherMembers
                ? "Remove checkout"
                : group.memberProjects.length > 1
                  ? "Remove this project everywhere"
                  : "Remove project"
            }
            description={
              hasOtherMembers
                ? "Deletes the selected machine's checkout entries and their threads. Other machines and files on disk are not touched."
                : group.memberProjects.length > 1
                  ? `Deletes all ${group.memberProjects.length} checkout entries and their threads on every machine. Files on disk are not touched.`
                  : "Deletes the project entry and its threads. Files on disk are not touched."
            }
            control={
              <Button
                size="sm"
                variant="destructive-outline"
                onClick={() => void removeMembers(group.memberProjects)}
              >
                <Trash2Icon />
                {hasOtherMembers
                  ? "Remove checkout"
                  : group.memberProjects.length > 1
                    ? "Remove all entries"
                    : "Remove project"}
              </Button>
            }
          />
        </SettingsSection>
      </SettingsPageContainer>

      <ProjectFaviconPickerDialog
        key={`${representative.environmentId}:${representative.workspaceRoot}:${faviconPickerOpen}`}
        cwd={representative.workspaceRoot}
        environmentId={representative.environmentId}
        onOpenChange={setFaviconPickerOpen}
        {...(pickProjectFavicon
          ? { onPickExternal: () => pickProjectFavicon(representative.workspaceRoot) }
          : {})}
        onSelect={(path) => void setProjectIcon({ faviconPath: path, projectIcon: null })}
        open={faviconPickerOpen}
        projectName={group.displayName}
      />
      {iconPickerOpen ? (
        <Suspense fallback={null}>
          <ProjectIconPickerDialog
            current={projectIcon}
            projectName={representative.title}
            open
            onOpenChange={setIconPickerOpen}
            onSelect={(icon) => void setProjectIcon({ faviconPath: null, projectIcon: icon })}
          />
        </Suspense>
      ) : null}
    </>
  );
}

/**
 * Re-point one checkout at another folder. A folder is one machine's directory,
 * so this is deliberately per-checkout and never a group fan-out. Each checkout
 * probes its own folder, so a moved folder reports itself on the row that points
 * at it rather than in a toast the user has already missed.
 */
function ProjectFolderSettings(props: {
  readonly member: SidebarProjectGroupMember;
  readonly projectName: string;
  readonly previousWorkspaceRoot: string | null;
  readonly onWorkspaceRootChanged: (projectId: string, previousPath: string) => void;
  readonly onChangeFolder: (workspaceRoot: string) => Promise<void>;
}) {
  const { member } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isChangingFolder, setIsChangingFolder] = useState(false);
  const changingFolderRef = useRef(false);
  const platform = browsePlatformFromOs(
    useEnvironments().environments.find(
      (candidate) => candidate.environmentId === member.environmentId,
    )?.serverConfig?.environment.platform.os,
  );

  // A trailing separator makes the server list the root itself, so a read
  // failure here means "this folder is gone" rather than "this folder is
  // empty". An unreachable environment fails the same request differently and
  // must not be reported as a folder the user needs to re-link.
  const workspaceRootProbe = useEnvironmentQuery(
    filesystemEnvironment.browse({
      environmentId: member.environmentId,
      input: { partialPath: ensureBrowseDirectoryPath(member.workspaceRoot) },
    }),
  );
  const workspaceRootIsMissing = isMissingDirectoryBrowseError(workspaceRootProbe.cause);

  const changeFolder = useCallback(
    async (workspaceRoot: string) => {
      if (changingFolderRef.current) return;
      changingFolderRef.current = true;
      setIsChangingFolder(true);
      try {
        await props.onChangeFolder(workspaceRoot);
      } finally {
        changingFolderRef.current = false;
        setIsChangingFolder(false);
      }
    },
    [props],
  );

  return (
    <>
      <SettingsRow
        title={member.environmentLabel ?? "Folder"}
        description={
          workspaceRootIsMissing
            ? "This folder no longer exists on the environment that runs this checkout. Pick where the project lives now."
            : member.workspaceRoot
        }
        status={
          workspaceRootIsMissing ? (
            <span className="text-warning">Folder not found.</span>
          ) : undefined
        }
        control={
          <div className="flex items-center gap-2">
            {props.previousWorkspaceRoot !== null ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={isChangingFolder}
                onClick={() => void changeFolder(props.previousWorkspaceRoot!)}
              >
                Undo
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={workspaceRootIsMissing ? "default" : "outline"}
              disabled={isChangingFolder}
              onClick={() => setPickerOpen(true)}
            >
              <FolderIcon className="size-3.5" />
              {workspaceRootIsMissing ? "Choose a folder…" : "Change folder…"}
            </Button>
          </div>
        }
      />
      {pickerOpen ? (
        <ProjectFolderPickerDialog
          currentPath={member.workspaceRoot}
          environmentId={member.environmentId}
          onClose={() => setPickerOpen(false)}
          onSelect={(workspaceRoot) => void changeFolder(workspaceRoot)}
          open
          platform={platform}
          projectName={props.projectName}
        />
      ) : null}
    </>
  );
}
