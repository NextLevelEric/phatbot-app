-- Keep the database PR enum aligned with the current PHATBOT scoring engine.
-- `personalRecords.ts` emits `best_at_weight` for rep milestones at a previously used load.
alter type public.pr_type add value if not exists 'best_at_weight';
