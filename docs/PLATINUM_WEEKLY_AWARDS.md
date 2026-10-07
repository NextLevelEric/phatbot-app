# Platinum weekly award artwork

Weekly art is selected at render time from the existing competition and cadence.
Historical award IDs, owners, period IDs, rankings, award keys, reveal state and
report snapshots are not rewritten. Future weekly awards use the same resolver.
Daily artwork files and mappings are retained.

## Assets and surfaces

The four supplied 2000 × 2000 PNGs are copied byte-for-byte to
`public/competition-awards/{beast,eager-beaver,cardio-bunny,step-king}-of-the-week-platinum.png`.
Beast has transparency; the other three supplied files have opaque backgrounds.
No background removal, recoloring, redrawing or cropping was performed.
Artwork uses `object-contain`; exported share cards use SVG aspect-ratio containment.

Updated paths:
- Athlete Profile Official Trophy Cabinet: separate daily and weekly counts/art.
- Compete: leader/winner preview, earned hardware, historical cabinet and selected award.
- New award reveal, without resetting reveal state.
- Competition share PNGs, including shares opened from historical awards.
- Weekly report finalized hardware, using each snapshot award's cadence.
- Championship Sunday finalized results.

Groups and Train Together retain their existing social-only behavior. No scoring,
eligibility, award issuance or competition finalization code changed.

## Pending read-function migration — not applied to production

`20261007193001_platinum_weekly_award_art.sql` adds `award_counts_by_cadence`
to `athlete_social_profile`, an array of `{ competition, cadence, count }`.
It derives counts solely from existing `competition_awards` joined to
`competition_periods`. All existing return columns and their aggregation semantics
remain unchanged, including `official_awards` and `award_counts`.

The CLI generated version `20261007191425`; it was resequenced to `20261007193001`
because this checkout already contains migration `20261007193000`.
PostgreSQL requires function recreation to add a RETURNS TABLE column. The migration
uses an explicit transaction, drops only this function without CASCADE, recreates
its existing authenticated/privacy checks and empty search path, and restores the
existing anon/PUBLIC revocations and authenticated grant before commit. Unexpected
dependent database objects cause a safe failure rather than cascading deletion.
No award/table DML is included. Schema-cache reload is requested on commit.

Before this migration is separately reviewed and applied, older RPC responses
continue to show the original aggregate cabinet with neutral trophy icons. They
are never assumed to be daily or weekly. Existing detail/reveal/share/report paths
already carry cadence and do not require the migration for platinum artwork.

## Validation and rollout checks

- `npm test -- --reporter=dot` (includes mixed-cadence render tests, all four PNGs,
  historical resolver immutability, and existing social competition isolation tests).
- `npm run typecheck`
- `npm run build -- --webpack`
- `git diff --check`
- Disposable PostgreSQL: install `@electric-sql/pglite@0.3.14` into a temporary
  directory, then run `node scripts/test-platinum-award-migration.mjs <absolute-package-path>`.
  This compiles the prior function and migration against isolated fixture tables;
  checks unchanged legacy output and award rows, mixed daily/weekly counts,
  empty cabinets, owner/private/profile/custom/missing-identity access and anon denial.
  It does not connect to Supabase or replay the entire production schema.

Before production rollout, separately review/apply the single migration. Do not use
broad database push. Verify on a preview/test account with mixed daily/weekly wins:
open the profile and Compete cabinet, select an older weekly win, export its share
image, and check a daily win retains gold artwork. Check all four trophies at mobile
width and a weekly report with mixed-cadence hardware. Confirm no counts or award IDs
change and no Groups/Train Together results appear in the official cabinet.
This PR does not deploy, apply production migrations, or re-trigger award reveals.
