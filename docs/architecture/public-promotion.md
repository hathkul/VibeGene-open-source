# Public promotion and release policy

`hathkul/vibegene` is the private development/integration repository.
`hathkul/vibegene-open-source` is the public distribution source of truth.
After a batch passes Tier 3, is merged and pushed to private `main`, and its
GitHub CI passes, assess and promote its publishable changes to public `main`.
The batch is not fully closed until promotion succeeds or a specific blocker is
reported. Do not repeat this process for every Tier 1 commit or Tier 2 checkpoint.

## Privacy review before any public push

1. Record the exact private source SHA/range and last promoted source SHA in
   private verification evidence. Inspect the cumulative changes, including
   tracked files, deletions, renames, binary assets, fixtures, documentation,
   workflows, generated files, and any metadata that will be published.
2. Check for credentials, tokens, signing keys, passwords, `.env` contents,
   private service endpoints, user/account identifiers, emails, personal paths,
   screenshots, logs, database exports, crash reports, local caches, release
   downloads, and unpublished research/construct/sequence/trace data. A tracked
   or gitignored file is not evidence of permission to publish it. Inspect
   binary/document metadata too; a secret-pattern scan alone is insufficient.
3. Exclude private material. Replace required test inputs with synthetic or
   explicitly redistributable fixtures, and redact private-only documentation.
   Preserve deliberately public attribution, licensing, notices, and scientific
   data with confirmed redistribution rights. If ownership or sensitivity is
   uncertain, hold that material and report the blocker; do not guess consent.
4. Review the exact proposed public tree, diff, commit messages, author metadata,
   and any new history. Check the staged export for secrets and private-data
   patterns without printing sensitive values into logs or public evidence.
   A discovered credential needs revocation/rotation, not just file removal.

## Promote a reviewed export, not private history

1. Use a separate clean checkout based on current public `main`. Verify the
   destination is `https://github.com/hathkul/vibegene-open-source.git` before
   any write. Do not switch or disturb a dirty private development worktree.
2. Apply only the reviewed publishable delta on a public promotion branch.
   Preserve public-only configuration, workflows, README, license, and notices;
   reconcile conflicts explicitly. Do not mirror repositories, push private
   branches/tags/history, or blindly merge/cherry-pick a private commit that
   contains excluded content. Do not use force-push or bypass branch protection.
3. Keep a private ledger mapping source SHA/range to public SHA, exclusions,
   replacements, review result, checks, and CI links. Public notes must not
   disclose excluded private filenames, identities, or data. Source SHAs need
   not match: sanitized public commits have their own history.
4. Validate in the public checkout. For an equivalent code export, reuse the
   private Tier 3 evidence and run affected checks for export/sanitization
   differences; public CI must pass before merge. If code, dependencies, build
   configuration, or fixtures differ materially, run the applicable full gate
   there. Never remove tests or weaken checks to make an incomplete export pass.
5. Merge and push public `main` through its normal protection/CI process. Record
   the public SHA and CI result. If blocked, retain the reviewed branch/evidence
   and report private integration and public promotion as separate statuses.

## Releases originate in the public repository

- New release tags, GitHub Releases, and release build workflows belong to
  `hathkul/vibegene-open-source`, not the private repository. Promotion does not
  itself request a new version, tag, or release; use the normal release request.
- Build from a clean checkout of the exact public release tag/SHA after its CI
  passes. Never upload a binary built from private-only or uncommitted sources
  as a public release. Local/macOS signing builds are allowed from that same
  public checkout; signing credentials stay outside both repositories/logs.
- Invoke Actions and `gh release` with the public repository explicitly selected
  (for example, `--repo hathkul/vibegene-open-source`). Do not dispatch release
  workflows in the private repository. If a platform workflow is unavailable
  publicly, report it and set up a reviewed public build rather than falling
  back to a private build.
- Configure release/signing secrets through the public repository's protected
  environments/settings, never by copying secret values into files. Review
  public workflow permissions/triggers before enabling privileged publishing.
- Record public source SHA/tag, workflow/build provenance, platform smoke,
  checksums, and signatures. Use public release artifact links for downloads;
  approved website/updater hosting may mirror the exact verified artifacts.
  Publish updater manifests only after artifact verification as described in
  [desktop updates](../desktop-updates.md).
- Existing private releases need not be moved, rewritten, or deleted. This policy
  governs subsequent releases; it does not authorize history rewriting.
