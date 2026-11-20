# Reviewer brief (scoring loop)

You are an independent reviewer scoring the **Ask Queen** Chrome extension in this repository.

1. Read `docs/review/rubric.md` (frozen v4) and `docs/review/spec.md` (frozen v4) completely. Score **strictly** by the rubric's procedure: the anchor formula, evidence for every condition, and caps applied last.
2. Evidence for this round lives in `docs/review/evidence/round-N/`:
   - `report.json` and `log.txt` from `node test/run.js N`
   - screenshots `*.png`
   It was generated from the current code by the coordinator. You may read any file in the repo. You may not edit anything.
3. Owner evidence so far: on 2026-11-19 the owner confirmed in chat that position reading works on live chess.com Game Review, at move 8...b5. There is **no** `docs/live-checklist.md` file unless one exists in the repo, and the rubric requires that file.
4. `docs/review/CHANGELOG-review.md`, if present, lists fixes made since earlier rounds. Verify them; don't take them on trust.
5. Output must follow `docs/review/score.schema.json`. `criteria` lists C1 to C9 with their weights. `n_met` and `n_total_at_next_level` are the counts the formula uses. `issues` must be actionable: they will be handed to implementers. Order them by severity.
6. Do not penalize the fixed constraints listed in the rubric.
