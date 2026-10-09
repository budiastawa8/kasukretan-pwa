export const APP_MAIN_SCROLL_ID = "app-main-scroll";

/** Scroll area konten utama (sidebar layout) ke atas. */
export function scrollAppMainToTop(): void {
  document.getElementById(APP_MAIN_SCROLL_ID)?.scrollTo({ top: 0, left: 0 });
}
