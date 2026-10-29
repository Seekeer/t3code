import { ComposerSelectControl } from "./chat/ComposerControl";
import { ComposerContextLabel } from "./ComposerContextLabel";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";
import { useAtomValue } from "@effect/atom-react";
import { shortcutLabelForCommand } from "../keybindings";
import { primaryServerKeybindingsAtom } from "../state/server";
import type { EnvironmentId } from "@t3tools/contracts";
import { PlusIcon, ScaleIcon } from "lucide-react";
import { memo, useRef, useState } from "react";

import { ADD_TO_MACHINE_LABEL_CLASS, type EnvironmentOption } from "./BranchToolbar.logic";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { RunContextShortcut, useRunContextDigitShortcuts } from "./runContextMenuShortcuts";
import { useComposerMenuProps } from "./chat/composerEventScope";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectValue,
} from "./ui/select";

interface BranchToolbarEnvironmentSelectorProps {
  autoEnvironmentLabel?: string | undefined;
  onAutoEnvironment?: (() => void) | undefined;
  envLocked: boolean;
  environmentId: EnvironmentId;
  availableEnvironments: readonly EnvironmentOption[];
  onEnvironmentChange?: (environmentId: EnvironmentId) => void;
  onAddToMachine?: (() => void) | undefined;
}

// Action values cannot collide with server-minted environment IDs.
const AUTO_VALUE = "action:auto";
const ADD_MACHINE_VALUE = "action:add-machine";
const environmentValue = (id: EnvironmentId) => `env:${id}`;

export const BranchToolbarEnvironmentSelector = memo(function BranchToolbarEnvironmentSelector({
  autoEnvironmentLabel,
  onAutoEnvironment,
  envLocked,
  environmentId,
  availableEnvironments,
  onEnvironmentChange,
  onAddToMachine,
}: BranchToolbarEnvironmentSelectorProps) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  useRunContextDigitShortcuts({ open, popupRef });
  const shortcutLabel = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "composer.host",
  );
  const activeEnvironment =
    availableEnvironments.find((env) => env.environmentId === environmentId) ?? null;

  const environmentItems = [
    ...(onAutoEnvironment
      ? [{ value: AUTO_VALUE, label: autoEnvironmentLabel ?? "Auto balance" }]
      : []),
    ...availableEnvironments.map((env) => ({
      value: environmentValue(env.environmentId),
      label: env.label,
    })),
    ...(onAddToMachine ? [{ value: ADD_MACHINE_VALUE, label: "Add to another machine" }] : []),
  ];

  // Match the xs control's height and padding: the composer strip has no min-height,
  // and its glass seam assumes that height even when this label is the only control.
  if (envLocked || (onEnvironmentChange === undefined && onAddToMachine === undefined)) {
    const lockedRow = (
      <span
        className="inline-flex h-7 min-w-0 max-w-full items-center gap-1 border border-transparent px-1.75 font-normal text-muted-foreground/70 text-xs sm:h-6"
        data-composer-context-control
      >
        <EnvironmentMachineIcon
          kind={activeEnvironment?.machine ?? "server"}
          className="size-3 shrink-0"
        />
        <ComposerContextLabel>{activeEnvironment?.label ?? "Run on"}</ComposerContextLabel>
      </span>
    );
    return (
      <Tooltip>
        <TooltipTrigger render={lockedRow} />
        <TooltipPopup>{activeEnvironment?.label ?? "Run on"}</TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <Select
      modal={false}
      open={open}
      onOpenChange={setOpen}
      value={autoEnvironmentLabel ? AUTO_VALUE : environmentValue(environmentId)}
      onValueChange={(value) => {
        if (value === ADD_MACHINE_VALUE) {
          onAddToMachine?.();
        } else if (value === AUTO_VALUE) {
          onAutoEnvironment?.();
        } else if (value?.startsWith("env:")) {
          onEnvironmentChange?.(value.slice(4) as EnvironmentId);
        }
      }}
      items={environmentItems}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerSelectControl
              size="xs"
              className="min-w-0 max-w-full"
              aria-label="Run on"
              data-composer-shortcut="composer.host"
              data-composer-context-control
            />
          }
        >
          {autoEnvironmentLabel ? (
            <ScaleIcon className="size-3 shrink-0" aria-hidden="true" />
          ) : (
            <EnvironmentMachineIcon
              kind={activeEnvironment?.machine ?? "server"}
              className="size-3 shrink-0"
            />
          )}
          <ComposerContextLabel>
            <SelectValue />
          </ComposerContextLabel>
        </TooltipTrigger>
        <TooltipPopup>
          {autoEnvironmentLabel ?? activeEnvironment?.label ?? "Run on"}
          {shortcutLabel ? ` · ${shortcutLabel}` : null}
        </TooltipPopup>
      </Tooltip>
      <SelectPopup ref={popupRef} alignItemWithTrigger={false} {...composerFloatingLayerProps}>
        <SelectGroup>
          <SelectGroupLabel>Run on</SelectGroupLabel>
          {onAutoEnvironment && (
            <SelectItem
              value={AUTO_VALUE}
              onClick={() => {
                if (autoEnvironmentLabel) onAutoEnvironment?.();
              }}
              endContent={<RunContextShortcut index={0} />}
            >
              <span className="inline-flex items-center gap-1.5">
                <ScaleIcon className="size-3" aria-hidden="true" />
                <span className="truncate">{autoEnvironmentLabel ?? "Auto balance"}</span>
              </span>
            </SelectItem>
          )}
          {availableEnvironments.map((env, index) => (
            <SelectItem
              key={env.environmentId}
              value={environmentValue(env.environmentId)}
              disabled={onEnvironmentChange === undefined && env.environmentId !== environmentId}
              endContent={<RunContextShortcut index={index + (onAutoEnvironment ? 1 : 0)} />}
            >
              <span className="inline-flex items-center gap-1.5">
                <EnvironmentMachineIcon kind={env.machine} className="size-3" />
                <span className="truncate">{env.label}</span>
              </span>
            </SelectItem>
          ))}
          {onAddToMachine ? (
            <SelectItem
              value={ADD_MACHINE_VALUE}
              endContent={
                <RunContextShortcut
                  index={(onAutoEnvironment ? 1 : 0) + availableEnvironments.length}
                />
              }
            >
              <span className={ADD_TO_MACHINE_LABEL_CLASS}>
                <PlusIcon aria-hidden="true" className="size-3" />
                <span className="truncate">Add to another machine</span>
              </span>
            </SelectItem>
          ) : null}
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
});
