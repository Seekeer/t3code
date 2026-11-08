import type { ThreadTagCount } from "@t3tools/client-runtime/state/thread-tags";
import { CheckIcon, TagIcon } from "lucide-react";
import { type ReactNode, useReducer, useRef } from "react";

import { reduceSidebarProjectScopeMenuState } from "../Sidebar.logic";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
  useComboboxFilter,
} from "../ui/combobox";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";

interface TagFilterItem {
  readonly value: string;
  readonly label: string;
  readonly count: number | null;
}

// Tags are never empty, so the empty string cannot name one.
const ALL_TAGS_VALUE = "";

export function ScopeRowIcon(props: { isSelected: boolean; children: ReactNode }) {
  return (
    <span className="relative flex shrink-0">
      {props.children}
      {props.isSelected ? (
        <span className="pointer-events-none absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-primary ring-2 ring-popover">
          <CheckIcon className="size-2 text-primary-foreground" strokeWidth={4} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

/** Narrows the sidebar to threads carrying any chosen tag; Shift picks several. */
export function SidebarTagFilter(props: {
  readonly tags: ReadonlyArray<ThreadTagCount>;
  readonly selectedTags: ReadonlyArray<string>;
  readonly onSelectedTagsChange: (tags: readonly string[]) => void;
}) {
  const { tags, selectedTags, onSelectedTagsChange } = props;
  const [menu, dispatchMenu] = useReducer(reduceSidebarProjectScopeMenuState, {
    open: false,
    query: "",
  });
  const filter = useComboboxFilter();
  const highlightedTagRef = useRef<string | null>(null);
  const items: TagFilterItem[] = [
    { value: ALL_TAGS_VALUE, label: "All tags", count: null },
    ...tags.map((entry) => ({ value: entry.tag, label: entry.tag, count: entry.count })),
  ];
  const query = menu.query.trim();
  const filteredItems =
    query.length === 0
      ? items
      : items.filter(
          (item) =>
            item.value !== ALL_TAGS_VALUE && filter.contains(item, query, (tag) => tag.label),
        );
  const selectedItem =
    selectedTags.length > 1
      ? null
      : (items.find((item) => item.value === (selectedTags[0] ?? ALL_TAGS_VALUE)) ?? items[0]!);
  const toggleTag = (tag: string) =>
    onSelectedTagsChange(
      selectedTags.includes(tag)
        ? selectedTags.filter((candidate) => candidate !== tag)
        : [...selectedTags, tag],
    );

  return (
    <Combobox
      items={items}
      filteredItems={filteredItems}
      autoHighlight
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={menu.open}
      onOpenChange={(open, eventDetails) => {
        if (eventDetails.isCanceled) return;
        dispatchMenu({ type: "open-changed", open });
      }}
      onItemHighlighted={(item) => {
        highlightedTagRef.current = item?.value ?? null;
      }}
      value={selectedItem}
      onValueChange={(item, eventDetails) => {
        if (!item) return;
        if (item.value === ALL_TAGS_VALUE) {
          onSelectedTagsChange([]);
        } else if (eventDetails.event instanceof MouseEvent && eventDetails.event.shiftKey) {
          // Canceling skips Base UI's commit, which would freeze the search query, and its close.
          eventDetails.cancel();
          toggleTag(item.value);
        } else {
          onSelectedTagsChange([item.value]);
        }
      }}
    >
      <ComboboxTrigger
        render={
          <SidebarHeaderIconButton
            label={
              selectedTags.length > 0
                ? `Filter threads by tag: ${selectedTags.join(", ")}`
                : "Filter threads by tag"
            }
          />
        }
      >
        <span className="relative flex shrink-0">
          <TagIcon className="size-4" />
          {selectedTags.length > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-1 ring-sidebar"
            />
          ) : null}
        </span>
      </ComboboxTrigger>
      <ComboboxPopup
        align="start"
        collisionAvoidance={{ side: "flip", align: "shift" }}
        className="w-[min(16rem,var(--available-width))] overflow-hidden"
        finalFocus={(closeType) => closeType === "keyboard"}
      >
        <ComboboxSearchInput
          aria-label="Search tags"
          placeholder="Search tags..."
          value={menu.query}
          onKeyDown={(event) => {
            if (event.defaultPrevented || event.nativeEvent.isComposing) return;
            if (!event.shiftKey || event.key !== "Enter") return;
            const tag = highlightedTagRef.current;
            if (tag === null || tag === ALL_TAGS_VALUE) return;
            event.preventDefault();
            toggleTag(tag);
          }}
          onChange={(event) => dispatchMenu({ type: "query-changed", query: event.target.value })}
        />
        <ComboboxEmpty>No matching tags.</ComboboxEmpty>
        <ComboboxList aria-multiselectable>
          {(item: TagFilterItem) => {
            const isSelected =
              item.value === ALL_TAGS_VALUE
                ? selectedTags.length === 0
                : selectedTags.includes(item.value);
            return (
              <ComboboxItem
                key={item.value}
                hideIndicator
                value={item}
                aria-selected={isSelected}
                // The icon badge marks selection; Base UI's single value would shade one row.
                data-selected={undefined}
              >
                <ScopeRowIcon isSelected={isSelected}>
                  <TagIcon className="size-4 shrink-0" />
                </ScopeRowIcon>
                <span className="min-w-0 truncate text-sm">{item.label}</span>
                {item.count !== null ? (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                    {item.count}
                  </span>
                ) : null}
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
