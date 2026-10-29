// Inputs whose keys aren't text (letters there can be shortcuts).
const NON_TEXT_INPUTS = ["checkbox", "radio", "range", "button", "color"];

/** Whether keys pressed at `target` are typing (text boxes, menus). */
export const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["TEXTAREA", "SELECT"].includes(target.tagName) ||
    (target instanceof HTMLInputElement &&
      !NON_TEXT_INPUTS.includes(target.type)));

/** A key pressed without Ctrl, Cmd or Alt (Shift is part of the key). */
export const isPlainKey = (event: KeyboardEvent) =>
  !(event.ctrlKey || event.metaKey || event.altKey);
