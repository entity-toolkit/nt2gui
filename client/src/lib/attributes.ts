/**
 * Organizing a simulation's attributes (flat, TOML-like dotted keys such as
 * `grid.metric.metric`) into nested blocks for display. Pure functions.
 */
import { AttributeValue } from "../api/types";
import { formatNumber } from "./format";

export interface AttributeEntry {
  /** The last part of the key, e.g. "metric". */
  name: string;
  /** The full key, e.g. "grid.metric.metric". */
  key: string;
  value: AttributeValue;
}

export interface AttributeBlock {
  /** e.g. "metric" */
  name: string;
  /** e.g. "grid.metric" ("" for top-level attributes). */
  path: string;
  entries: AttributeEntry[];
  blocks: AttributeBlock[];
}

/** The block holding attributes without a dot (e.g. `Dimension`). */
export const GENERAL_BLOCK = "general";

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * Blocks by first key part, nested by the following ones; each block lists
 * its own variables and sub-blocks alphabetically. Top-level attributes
 * form a first `general` block.
 */
export const groupAttributes = (
  attrs: Record<string, AttributeValue>,
): AttributeBlock[] => {
  const root: AttributeBlock = { name: "", path: "", entries: [], blocks: [] };
  for (const [key, value] of Object.entries(attrs)) {
    const parts = key.split(".");
    const name = parts.pop() as string;
    let block = root;
    parts.forEach((part, depth) => {
      let child = block.blocks.find((b) => b.name === part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, depth + 1).join("."),
          entries: [],
          blocks: [],
        };
        block.blocks.push(child);
      }
      block = child;
    });
    block.entries.push({ name, key, value });
  }
  const sort = (block: AttributeBlock) => {
    block.entries.sort(byName);
    block.blocks.sort(byName);
    block.blocks.forEach(sort);
  };
  sort(root);
  return root.entries.length
    ? [
        { name: GENERAL_BLOCK, path: "", entries: root.entries, blocks: [] },
        ...root.blocks,
      ]
    : root.blocks;
};

const formatItem = (value: string | number | boolean): string =>
  typeof value === "number"
    ? Number.isInteger(value)
      ? String(value)
      : formatNumber(value, 6)
    : typeof value === "boolean"
      ? String(value)
      : value === ""
        ? "–"
        : value;

/** A value as text: numbers compactly, lists as "[a, b]", empty text as "–". */
export const formatAttribute = (value: AttributeValue): string =>
  Array.isArray(value)
    ? `[${value.map(formatItem).join(", ")}]`
    : formatItem(value);

/**
 * Only the attributes whose key or value contains `query` (any case); all
 * of them for an empty query.
 */
export const filterAttributes = (
  attrs: Record<string, AttributeValue>,
  query: string,
): Record<string, AttributeValue> => {
  const needle = query.trim().toLowerCase();
  if (!needle) return attrs;
  return Object.fromEntries(
    Object.entries(attrs).filter(
      ([key, value]) =>
        key.toLowerCase().includes(needle) ||
        formatAttribute(value).toLowerCase().includes(needle),
    ),
  );
};

/** Number of variables in a block and its sub-blocks. */
export const countAttributes = (block: AttributeBlock): number =>
  block.entries.length +
  block.blocks.reduce((total, child) => total + countAttributes(child), 0);
