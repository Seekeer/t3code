import { canCreateConversationBranchFromMessage } from "@t3tools/client-runtime/state/thread-branches";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  CommandId,
  type EnvironmentId,
  type OrchestrationMessage,
  ThreadId,
} from "@t3tools/contracts";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { memo, useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, type ColorValue } from "react-native";

import { SymbolView } from "../../components/AppSymbol";
import { uuidv4 } from "../../lib/uuid";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

/**
 * Branches a new conversation off this reply and opens it.
 *
 * The destination id and command id are minted once per message so a retry
 * after a dropped connection resolves to the same command receipt - and
 * therefore the same branch - instead of a second one.
 */
export const BranchConversationButton = memo(function BranchConversationButton(props: {
  readonly message: Pick<OrchestrationMessage, "id" | "role" | "streaming" | "completion">;
  readonly environmentId: EnvironmentId;
  readonly sourceThreadId: ThreadId;
  readonly tintColor?: ColorValue;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<ReactNavigation.RootParamList, "Thread">>();
  const createBranch = useAtomCommand(threadEnvironment.createBranch, { reportFailure: false });
  const requestRef = useRef<{ threadId: ThreadId; commandId: CommandId } | null>(null);
  const [pending, setPending] = useState(false);

  const onBranch = useCallback(async () => {
    const request = (requestRef.current ??= {
      threadId: ThreadId.make(uuidv4()),
      commandId: CommandId.make(uuidv4()),
    });
    setPending(true);
    const result = await createBranch({
      environmentId: props.environmentId,
      input: {
        threadId: request.threadId,
        commandId: request.commandId,
        sourceThreadId: props.sourceThreadId,
        sourceMessageId: props.message.id,
      },
    });
    setPending(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      Alert.alert(
        "Could not create branch",
        error instanceof Error ? error.message : "An error occurred.",
      );
      return;
    }
    navigation.dispatch(
      CommonActions.navigate("Thread", {
        environmentId: props.environmentId,
        threadId: request.threadId,
      }),
    );
  }, [createBranch, navigation, props.environmentId, props.message.id, props.sourceThreadId]);

  if (!canCreateConversationBranchFromMessage(props.message)) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Branch from this reply"
      disabled={pending}
      hitSlop={8}
      onPress={() => void onBranch()}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9,
        opacity: pressed ? 0.52 : 1,
      })}
    >
      {pending ? (
        <ActivityIndicator size="small" />
      ) : (
        <SymbolView
          name="arrow.triangle.branch"
          size={13}
          tintColor={props.tintColor}
          tintColorClassName={props.tintColor ? undefined : "accent-foreground"}
          type="monochrome"
        />
      )}
    </Pressable>
  );
});
