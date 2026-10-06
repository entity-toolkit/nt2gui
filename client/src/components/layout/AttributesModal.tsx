import { useMemo, useState } from "react";
import { TbChevronDown, TbChevronRight } from "react-icons/tb";
import { fetchSimulationAttributes } from "../../api/simulations";
import { cachedLoader, useCachedResource } from "../../hooks/useCachedResource";
import {
  AttributeBlock,
  countAttributes,
  filterAttributes,
  formatAttribute,
  groupAttributes,
} from "../../lib/attributes";
import { useSimulationVersion } from "../../state/simulationData";
import Modal from "../common/Modal";
import styles from "./AttributesModal.module.css";

const getAttributes = cachedLoader(async (id) =>
  fetchSimulationAttributes(id).then((response) => response.attrs),
);

/** A block's variables, then its sub-blocks (indented, by full path). */
const BlockContents = ({ block }: { block: AttributeBlock }) => (
  <>
    {block.entries.length > 0 && (
      <dl className={styles.entries}>
        {block.entries.map((entry) => (
          <div key={entry.key} className={styles.entry} title={entry.key}>
            <dt>{entry.name}</dt>
            <dd>{formatAttribute(entry.value)}</dd>
          </div>
        ))}
      </dl>
    )}
    {block.blocks.map((child) => (
      <section
        key={child.path}
        className={styles.subblock}
        aria-label={child.path}
      >
        <h4 className={styles.subheading}>
          {child.path.split(".").slice(1).join(" › ")}
        </h4>
        <BlockContents block={child} />
      </section>
    ))}
  </>
);

/**
 * A simulation's parameters (`<block>.<subblock>.<name>`), grouped into
 * collapsible blocks with a filter over names and values.
 */
const AttributesModal = ({
  simulationId,
  name,
  onClose,
}: {
  simulationId: string;
  name: string;
  onClose: () => void;
}) => {
  const { data: attrs, error } = useCachedResource(
    simulationId,
    getAttributes,
    useSimulationVersion(simulationId),
  );
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const blocks = useMemo(
    () => (attrs ? groupAttributes(filterAttributes(attrs, query)) : []),
    [attrs, query],
  );
  const total = attrs ? Object.keys(attrs).length : 0;
  const shown = blocks.reduce((sum, block) => sum + countAttributes(block), 0);
  // While filtering, every match is visible.
  const isOpen = (block: AttributeBlock) =>
    query.trim() !== "" || !collapsed.has(block.name);
  const toggle = (block: AttributeBlock) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(block.name)) next.delete(block.name);
      else next.add(block.name);
      return next;
    });
  const allCollapsed = blocks.length > 0 && blocks.every((b) => !isOpen(b));

  return (
    <Modal
      title={`Attributes · ${name}`}
      onClose={onClose}
      className={styles.modal}
    >
      {error ? (
        <p className={styles.message} role="alert">
          {error}
        </p>
      ) : !attrs ? (
        <p className={styles.message}>Reading attributes…</p>
      ) : total === 0 ? (
        <p className={styles.message}>This simulation has no attributes.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <input
              type="search"
              className={styles.filter}
              placeholder="Filter by name or value"
              aria-label="Filter attributes"
              value={query}
              autoFocus
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span className={styles.count}>
              {shown === total ? `${total}` : `${shown} of ${total}`} attributes
            </span>
            <button
              type="button"
              className={styles.toggleAll}
              disabled={query.trim() !== ""}
              onClick={() =>
                setCollapsed(
                  allCollapsed ? new Set() : new Set(blocks.map((b) => b.name)),
                )
              }
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>
          <div className={styles.blocks}>
            {blocks.length === 0 && (
              <p className={styles.message}>No attribute matches “{query}”.</p>
            )}
            {blocks.map((block) => {
              const open = isOpen(block);
              return (
                <section
                  key={block.name}
                  className={styles.block}
                  aria-label={block.name}
                >
                  <button
                    type="button"
                    className={styles.blockHeader}
                    aria-expanded={open}
                    onClick={() => toggle(block)}
                  >
                    {open ? (
                      <TbChevronDown aria-hidden />
                    ) : (
                      <TbChevronRight aria-hidden />
                    )}
                    <span className={styles.blockName}>{block.name}</span>
                    <span className={styles.blockCount}>
                      {countAttributes(block)}
                    </span>
                  </button>
                  {open && (
                    <div className={styles.blockBody}>
                      <BlockContents block={block} />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
};

export default AttributesModal;
