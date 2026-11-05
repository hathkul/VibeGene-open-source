export type Primer3WorkerResponse =
  | { ok: true; output: string }
  | { ok: false; error: string }
