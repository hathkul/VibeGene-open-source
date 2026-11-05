/** Stable class for phone-only column hiding in database record tables. */
export function dbFileColumnClassName(columnId: string): string {
  return `db-file-col-${columnId}`
}
