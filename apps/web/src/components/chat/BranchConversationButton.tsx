import { canCreateConversationBranchFromMessage } from "@t3tools/client-runtime/state/thread-branches";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { CommandId } from "@t3tools/contracts";
import { GitBranchIcon, Loader2Icon } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { newThreadId, randomUUID } from "~/lib/utils";
import { buildThreadRouteParams } from "~/threadRoutes";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import type { ChatMessage } from "~/types";

/**
 * Branches a new conversation off this reply and opens it.
 *
 * The destination id and command id are minted once per message so a retry
 * after a dropped connection resolves to the same command receipt - and
 * therefore the same branch - instead of a second one.
 */
export const BranchConversationButton = memo(function BranchConversationButton({
  message,
  environmentId,
  sourceThreadId,
}: {
  message: ChatMessage;
  environmentId: EnvironmentId;
  sourceThreadId: ThreadId;
}) {
  const navigate = useNavigate();
  const createBranch = useAtomCommand(threadEnvironment.createBranch, { reportFailure: false });
  const requestRef = useRef<{ threadId: ThreadId; commandId: CommandId } | null>(null);
  const [pending, setPending] = useState(false);

  const onBranch = useCallback(async () => {
    const request = (requestRef.current ??= {
      threadId: newThreadId(),
      commandId: CommandId.make(randomUUID()),
    });
    setPending(true);
    const result = await createBranch({
      environmentId,
      input: {
        threadId: request.threadId,
        commandId: request.commandId,
        sourceThreadId,
        sourceMessageId: message.id,
      },
    });
    setPending(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not create branch",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
      return;
    }
    await navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, request.threadId)),
    });
  }, [createBranch, environmentId, message.id, navigate, sourceThreadId]);

  if (!canCreateConversationBranchFromMessage(message)) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Branch from this reply"
            disabled={pending}
            onClick={() => void onBranch()}
            type="button"
            size="icon-xs"
            variant="ghost-muted"
          />
        }
      >
        {pending ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : (
          <GitBranchIcon className="size-3" />
        )}
      </TooltipTrigger>
      <TooltipPopup>
        <p>Branch from this reply</p>
      </TooltipPopup>
    </Tooltip>
  );
});
