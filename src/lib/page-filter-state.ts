import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_PREFIX = "kasukretan:page-filters:";

type FilterBlob = Record<string, unknown>;

function storageKey(pageId: string): string {
  return STORAGE_PREFIX + pageId;
}

function readBlob(pageId: string): FilterBlob {
  try {
    const raw = sessionStorage.getItem(storageKey(pageId));
    return raw ? (JSON.parse(raw) as FilterBlob) : {};
  } catch {
    return {};
  }
}

function writeBlob(pageId: string, blob: FilterBlob): void {
  try {
    sessionStorage.setItem(storageKey(pageId), JSON.stringify(blob));
  } catch {
    /* abaikan quota */
  }
}

/** Hapus filter tersimpan untuk halaman (dipanggil dari tombol Reset). */
export function clearPagePersistedState(pageId: string): void {
  try {
    sessionStorage.removeItem(storageKey(pageId));
  } catch {
    /* ignore */
  }
}

/**
 * useState yang otomatis disimpan di sessionStorage per halaman.
 * Dipakai untuk filter/tab agar tidak hilang setelah pratinjau PDF.
 */
export function usePersistedScalar<T>(
  pageId: string,
  field: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const blob = readBlob(pageId);
    if (field in blob) return blob[field] as T;
    return defaultValue;
  });

  useEffect(() => {
    const blob = readBlob(pageId);
    blob[field] = value;
    writeBlob(pageId, blob);
  }, [pageId, field, value]);

  return [value, setValue];
}

/** Path + query lengkap untuk tombol kembali dari pratinjau PDF. */
export function pageBackTo(pathname: string, search: string): string {
  return search ? `${pathname}${search}` : pathname;
}

export function usePageBackTo(): string {
  const { pathname, search } = useLocation();
  return pageBackTo(pathname, search);
}
