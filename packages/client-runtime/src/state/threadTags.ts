import { ThreadTag } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export interface ThreadTagCount {
  readonly tag: string;
  readonly count: number;
}

const decodeThreadTag = Schema.decodeUnknownOption(ThreadTag);

/** The tag a user typed, trimmed, or null when the server would reject it. */
export function parseThreadTag(input: string): string | null {
  return Option.getOrNull(decodeThreadTag(input));
}

/** Distinct trimmed tags with how many threads carry each, most used first, then by name. */
export function collectThreadTags(
  threads: ReadonlyArray<{ readonly tags?: ReadonlyArray<string> | undefined }>,
): ReadonlyArray<ThreadTagCount> {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    // A hand-edited duplicate must not count one thread twice.
    for (const tag of new Set(thread.tags?.map((value) => value.trim()))) {
      if (tag !== "") counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort(
    (left, right) => right.count - left.count || left.tag.localeCompare(right.tag),
  );
}

export function threadTagCountsEqual(
  left: ReadonlyArray<ThreadTagCount>,
  right: ReadonlyArray<ThreadTagCount>,
): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every(
        (entry, index) => entry.tag === right[index]!.tag && entry.count === right[index]!.count,
      ))
  );
}

/** Whether a thread passes a tag filter: any chosen tag matches; no filter passes everything. */
export function matchesThreadTagFilter(
  tags: ReadonlyArray<string> | undefined,
  chosenTags: ReadonlySet<string> | null,
): boolean {
  return chosenTags === null || tags?.some((tag) => chosenTags.has(tag.trim())) === true;
}
