/** Contact address for EMBL-EBI Job Dispatcher, supplied by the deployment. */
export function jobDispatcherEmail(): string {
  const email = (import.meta.env.VITE_EMBL_EBI_EMAIL as string | undefined)?.trim()
  if (!email) throw new Error('Set VITE_EMBL_EBI_EMAIL to a valid contact address for EMBL-EBI jobs.')
  return email
}
