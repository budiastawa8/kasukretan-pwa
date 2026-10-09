import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ClipboardPaste, Copy, RefreshCw } from "lucide-react";
import {
  canCopyFromContext,
  canPasteFromContext,
  clampMenuPosition,
  copyFromContext,
  goBackFromContext,
  pasteFromContext,
  refreshFromContext,
} from "../../lib/app-context-menu";
import { isDesktopApp } from "../../lib/runtime";
import { cn } from "../../lib/utils";

type MenuState = {
  x: number;
  y: number;
  canCopy: boolean;
  canPaste: boolean;
};

const MENU_WIDTH = 168;
const MENU_ITEM_HEIGHT = 36;
const MENU_PADDING = 6;
const MENU_HEIGHT = MENU_PADDING * 2 + MENU_ITEM_HEIGHT * 4;

function ContextMenuItem({
  label,
  icon: Icon,
  disabled,
  onAction,
}: {
  label: string;
  icon: typeof Copy;
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-left transition-colors",
        disabled
          ? "text-copper-400 cursor-not-allowed"
          : "text-copper-900 hover:bg-copper-100 active:bg-copper-200"
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        if (disabled) return;
        onAction();
      }}
    >
      <Icon size={15} className="shrink-0 opacity-80" aria-hidden />
      {label}
    </button>
  );
}

export function AppContextMenu() {
  const desktop = isDesktopApp();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!desktop) return;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setMenu({
        x: e.clientX,
        y: e.clientY,
        canCopy: canCopyFromContext(),
        canPaste: canPasteFromContext(),
      });
    };

    const onDismiss = () => close();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onDismiss);

    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onDismiss);
    };
  }, [close, desktop]);

  useLayoutEffect(() => {
    if (!menu) return;
    const clamped = clampMenuPosition(menu.x, menu.y, MENU_WIDTH, MENU_HEIGHT);
    setPosition(clamped);
  }, [menu]);

  if (!desktop || !menu) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[9999] min-w-[168px] rounded-lg border border-copper-200 bg-card py-1.5 shadow-lg shadow-copper-950/15"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ContextMenuItem
        label="Salin"
        icon={Copy}
        disabled={!menu.canCopy}
        onAction={() => {
          void copyFromContext();
          close();
        }}
      />
      <ContextMenuItem
        label="Tempel"
        icon={ClipboardPaste}
        disabled={!menu.canPaste}
        onAction={() => {
          void pasteFromContext();
          close();
        }}
      />
      <div className="my-1 border-t border-copper-100" role="separator" />
      <ContextMenuItem
        label="Kembali"
        icon={ArrowLeft}
        onAction={() => {
          goBackFromContext();
          close();
        }}
      />
      <ContextMenuItem
        label="Muat ulang"
        icon={RefreshCw}
        onAction={() => {
          close();
          refreshFromContext();
        }}
      />
    </div>
  );
}
