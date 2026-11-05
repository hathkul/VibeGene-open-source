/**
 * Phone-web overlay z-index ladder. Keep in sync with App.css under the touch-shell
 * `@media (hover: none) and (pointer: coarse)…` + `html:not(.vg-hybrid-window)` rules.
 */
export const MOBILE_SHELL_CHROME_MAX_Z_INDEX = 130

/** Full-screen non-cloning dialogs (Database, modals, simple translation backdrops). */
export const MOBILE_FULLSCREEN_DIALOG_Z_INDEX = 140

/** Restriction / Gibson / PCR cloning workspace host. */
export const MOBILE_CLONING_WORKSPACE_Z_INDEX = 150

/** Nested modals inside cloning (dNTP, PCR design, overlap primers). */
export const MOBILE_CLONING_NESTED_MODAL_Z_INDEX = 180

/** Dropdowns / portaled menus opened from cloning or gel dialogs. */
export const MOBILE_CLONING_MENU_Z_INDEX = 200
