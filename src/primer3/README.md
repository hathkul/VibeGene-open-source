# Primer3 thermodynamic client

`runPrimer3Thal` reuses one serialized module worker, deduplicates equivalent
requests, and keeps a least-recently-used cache of the most recent 512 successful
thermodynamic results per client. The default bound accommodates a revisit of
the 130 displayed-site set in the current VSV plasmid workflow while keeping
memory finite. `runPrimer3ThalBatch` preserves input order and shares the same
worker, in-flight deduplication, and cache. Aborting one caller detaches only
that caller; abandoning the final subscriber to active work restarts the worker
so an obsolete calculation cannot hold up newer work.
