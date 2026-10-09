function isTextInput(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    return (
      type === "text" ||
      type === "search" ||
      type === "url" ||
      type === "tel" ||
      type === "email" ||
      type === "password" ||
      type === "number" ||
      type === ""
    );
  }
  return false;
}

export function isEditableField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) {
    return el.getAttribute("contenteditable") !== "false";
  }
  if (isTextInput(el)) {
    return !el.disabled && !el.readOnly;
  }
  return false;
}

export function getSelectedText(): string {
  const fromSelection = window.getSelection()?.toString() ?? "";
  if (fromSelection) return fromSelection;

  const active = document.activeElement;
  if (isTextInput(active)) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    if (end > start) return active.value.slice(start, end);
  }
  return "";
}

export function canCopyFromContext(): boolean {
  return getSelectedText().length > 0;
}

export function canPasteFromContext(): boolean {
  return isEditableField(document.activeElement);
}

export async function copyFromContext(): Promise<boolean> {
  const text = getSelectedText();
  if (!text) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

export async function pasteFromContext(): Promise<boolean> {
  const active = document.activeElement;
  if (!isEditableField(active)) return false;

  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    try {
      return document.execCommand("paste");
    } catch {
      return false;
    }
  }

  if (isTextInput(active)) {
    const start = active.selectionStart ?? active.value.length;
    const end = active.selectionEnd ?? start;
    const next = active.value.slice(0, start) + text + active.value.slice(end);
    active.value = next;
    const caret = start + text.length;
    active.selectionStart = caret;
    active.selectionEnd = caret;
    active.dispatchEvent(new Event("input", { bubbles: true }));
    active.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    active.focus();
    try {
      return document.execCommand("insertText", false, text);
    } catch {
      return false;
    }
  }

  return false;
}

export function goBackFromContext(): void {
  window.history.back();
}

export function refreshFromContext(): void {
  window.location.reload();
}

export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number
): { x: number; y: number } {
  const margin = 8;
  const maxX = window.innerWidth - menuWidth - margin;
  const maxY = window.innerHeight - menuHeight - margin;
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  };
}
