import {
  conversationBranchNotice,
  conversationBranchNoticeText,
} from "@t3tools/client-runtime/state/thread-branches";
import type { ThreadBranchProvenance } from "@t3tools/contracts";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { SymbolView } from "../../components/AppSymbol";
import { useThreadShells } from "../../state/entities";

/**
 * A branch carries its conversation as text only, so it says so for as long as
 * it exists. Not dismissible: the limit is a property of the branch, not a
 * piece of news.
 */
export const ConversationBranchNotice = memo(function ConversationBranchNotice(props: {
  readonly environmentId: string;
  readonly branchedFrom: ThreadBranchProvenance | null | undefined;
}) {
  const shells = useThreadShells();
  const navigation =
    useNavigation<NativeStackNavigationProp<ReactNavigation.RootParamList, "Thread">>();
  const notice = conversationBranchNotice(
    props.branchedFrom,
    shells.some(
      (shell) =>
        shell.environmentId === props.environmentId &&
        shell.id === props.branchedFrom?.sourceThreadId,
    ),
  );
  if (notice === null) {
    return null;
  }

  return (
    <View className="mx-3 mb-2 flex-row items-start gap-2 rounded-xl bg-subtle-strong px-3 py-2">
      <SymbolView name="arrow.triangle.branch" size={14} className="mt-0.5" type="monochrome" />
      <View className="min-w-0 flex-1">
        <Text className="text-xs leading-relaxed text-foreground-secondary">
          {conversationBranchNoticeText(notice)}
        </Text>
        {notice.sourceAvailable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View source conversation"
            hitSlop={8}
            onPress={() => {
              navigation.dispatch(
                CommonActions.navigate("Thread", {
                  environmentId: props.environmentId,
                  threadId: notice.sourceThreadId,
                }),
              );
            }}
          >
            <Text className="mt-1 text-xs font-t3-medium text-accent">View source</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
