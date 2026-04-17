# DataFusion Platform - How It Works (Page-Wise + Score Logic)

This document explains how the current implementation works in code, including:
- End-to-end data flow
- How each score is calculated
- What each page fetches and displays
- Important implementation notes where scoring scales differ

## 1) End-to-End Flow (Actual Runtime)

1. Source records are generated/seeded into `db2_customer_simulated` by `db_utils.py`.
2. Kafka producer reads source rows and publishes events (`kafka_producer.py`).
3. Kafka consumer ingests events into raw vault table `bronze_customer` (`kafka_consumer.py`).
4. Silver transformer normalizes fields into `silver_customer` and computes completeness (`silver_transformer.py`).
5. Dedup engine creates candidate duplicate pairs in `duplicate_matches` (`dedup_engine.py`).
6. Decision engine classifies each match into AUTO_MERGE / MANUAL_REVIEW / SEPARATE (`decision_engine.py`).
7. Golden merger builds unified master records in `gold_customer` (`golden_merger.py`).
8. FastAPI exposes everything through endpoints in `golden_record_platform/api/main.py`.
9. React pages fetch those endpoints and render dashboards/workbench/table views (`frontend/src/pages/*`).

## 2) Core Score Formulas and Thresholds

## 2.1 Canonical Completeness Score
File: `silver_transformer.py`

For each silver record:
- Consider fields: first_name, last_name, email, phone, birth_date, address, city
- completeness = (number_of_non_empty_fields / 7) * 100
- Rounded to 1 decimal

Formula:

completeness_pct = round((filled_fields / 7) * 100, 1)

## 2.2 Duplicate Matching Feature Scores
File: `dedup_engine.py`

Per pair (A, B):
- email_match = 1.0 if normalized emails are equal and non-empty else 0.0
- phone_match = 1.0 if normalized phones are equal and non-empty else 0.0
- dob_match = 1.0 if normalized DOBs are equal and non-empty else 0.0
- name_similarity = fuzzy token-sort ratio / 100
- city_similarity = fuzzy ratio / 100

All feature scores are in 0..1.

## 2.3 Composite Match Score
File: `dedup_engine.py`

Weights:
- Email: 0.35
- Phone: 0.30
- Name: 0.20
- DOB: 0.10
- City: 0.05

Formula:

composite =
  (email_match * 0.35) +
  (phone_match * 0.30) +
  (name_similarity * 0.20) +
  (dob_match * 0.10) +
  (city_similarity * 0.05)

This composite is 0..1.

Candidate insertion gate:
- Only keep pair if composite >= 0.55

## 2.4 AI Score Used by Decision Engine
File: `dedup_engine.py`

ai_score = min(100, composite * 100 + bonus)
bonus = 5 if phone_match == 1 and dob_match == 1, else 0

So ai_score is a percentage-like value in 0..100.

## 2.5 Decision Thresholds
File: `decision_engine.py`

- AUTO_MERGE if ai_score >= 90
- MANUAL_REVIEW if 70 <= ai_score < 90
- SEPARATE if ai_score < 70

Manual-review matches are added to `review_queue` with status PENDING.

## 2.6 Master (Gold) Merge Confidence
File: `golden_merger.py`

For merged groups:
- Take approved edges (AUTO_MERGE or APPROVED)
- Build union-find groups
- Group confidence = average(ai_score) over edges inside the group

For singleton records:
- merge_confidence = 100.0

Note: merge_confidence is stored as numeric values that are typically 0..100 in current implementation.

## 2.7 Quality Progression Scores (Raw -> Canonical -> Identity -> Master)
File: `golden_record_platform/api/main.py` endpoint `/quality/progression`

The endpoint computes layer metrics using SQL aggregates and formulas, then enforces monotonic progression.

Highlights:
- Raw confidence fixed at 0.0
- Raw completeness/consistency derived from source field presence/format checks
- Canonical confidence from email/phone validity mix
- Identity confidence from avg duplicate match ai_score
- Master confidence from avg gold merge_confidence
- Then clamps to 0..100 and forces stage-over-stage increases for presentation

This is presentation KPI math, not the same as dedup pair scoring.

## 3) Backend API Sections (What Feeds UI)

Main API file: `golden_record_platform/api/main.py`

Major endpoint groups:
- Health/Summary: `/health`, `/summary`, `/quality/progression`
- Pipeline: `/pipeline/run`, `/pipeline/status`, `/pipeline/history`, `/pipeline/rebuild-master`, `/events`
- Raw Vault: `/vault/records`, `/vault/records/{id}`, `/vault/stats`
- Canonical: `/canonical/records`, `/canonical/stats`, `/canonical/quality-issues`
- Identity: `/identity/graph`, `/identity/graph/{id}`, `/identity/stats`
- Review: `/review/queue`, `/review/decide`, `/review/bulk-decide`, `/review/stats`, `/review/ai-suggest/{id}`
- Master: `/master/records`, `/master/records/{id}`, `/master/stats`, `/master/export`, `/master/corrections-preview`
- Lineage: `/lineage-search`, `/lineage/{cust_id}`
- AI: `/ai/analyze-match`, `/ai/explain-record/{master_id}`, `/ai/data-quality-report`, `/ai/chat`

## 4) Page-Wise Behavior (Frontend)

Routes are configured in `frontend/src/App.tsx`.

## 4.1 Command Center (`/`)
File: `frontend/src/pages/CommandCenter.tsx`

Fetches:
- `/summary` (polling every 30s)
- `/ai/data-quality-report` (on mount)

Displays/calculates:
- KPI cards directly from summary counts
- Funnel bars from summary stage totals
- Donut split from `auto_merged`, `manual_review`, `decided_separate`
- Donut percentages = slice_value / total_decisions
- Quality ring uses `quality_score` from AI report

## 4.2 Pipeline Orchestration (`/pipeline`)
File: `frontend/src/pages/PipelineOrchestration.tsx`

Fetches:
- `/pipeline/run` to run full pipeline
- `/pipeline/rebuild-master` to rebuild gold
- `/pipeline/history`
- SSE stream `/events` using `useSSE`

Displays/calculates:
- Stage cards with state transitions: idle -> running -> complete/error
- Logs from SSE event lines
- Result table from `runResult.stages`

Important:
- Backend currently executes full run in `/pipeline/run` and returns synthetic stage durations (`duration_ms: 100` per stage in response payload generation).

## 4.3 Raw Vault Explorer (`/raw-vault`)
File: `frontend/src/pages/RawVaultExplorer.tsx`

Fetches:
- `/vault/records` with limit/offset/search

Displays:
- Immutable raw records table
- Kafka offset/partition metadata
- Raw payload JSON in side panel

No scoring formula here.

## 4.4 Canonical Explorer (`/canonical`)
File: `frontend/src/pages/CanonicalExplorer.tsx`

Fetches:
- `/canonical/stats`
- `/canonical/quality-issues`
- `/canonical/records` with search, min completeness, pagination

Displays/calculates:
- Completeness color bands:
  - >80 green
  - 50..80 amber
  - <50 red
- Completeness display converts possible 0..1 to 0..100 if needed:
  - if value <= 1 then value * 100
  - else use value directly

## 4.5 Identity Graph (`/identity-graph`)
File: `frontend/src/pages/IdentityGraph.tsx`

Fetches:
- `/identity/stats`
- `/identity/graph` with decision filter and pagination

Displays/calculates:
- Tab counts from identity stats
- Signal bars use feature_score * 100
- Composite score shown as percent from backend `composite_score`
- Status mapped from decision enum:
  - auto_merged
  - manual_review
  - decided_separate
  - pending

## 4.6 Review Workbench (`/review`)
File: `frontend/src/pages/ReviewWorkbench.tsx`

Fetches:
- `/review/queue`
- `/review/stats`
- `/ai/analyze-match` per current item

Writes:
- `/review/decide` for approve/reject

Behavior/calculations:
- Optimistic queue removal before API commit
- Keyboard shortcuts:
  - A / Right Arrow -> approve
  - R / Left Arrow -> reject
  - S -> skip
- AI panel auto-loads suggestion per match

Important scale note:
- UI often computes `Math.round(composite_score * 100)`.
- Backend currently sends `composite_score` from `ai_score` (already 0..100 in many responses).
- This can lead to inflated displayed percentages in this page depending on payload shape.

## 4.7 Master Records (`/master-records`)
File: `frontend/src/pages/MasterRecords.tsx`

Fetches:
- `/master/records`
- `/master/stats`
- `/master/corrections-preview`
- `/ai/explain-record/{master_id}`

Writes/exports:
- `/master/export?format=csv`

Displays/calculations:
- Confidence bar expects value in 0..1 and multiplies by 100 for display.

Important scale note:
- Backend `confidence_score` currently comes from `merge_confidence` values usually in 0..100.
- UI confidence bar clamps values above 1 to 1, so many rows may render as 100% visually.

## 4.8 Data Lineage (`/lineage`)
File: `frontend/src/pages/DataLineage.tsx`

Fetches:
- `/lineage-search`
- `/lineage/{cust_id}`

Displays:
- Source -> Vault -> Canonical -> Identity -> Master flow
- Timeline events from backend
- Match branch nodes and status badges

Score usage:
- Displays match `composite_score` from lineage response, rounded.

## 4.9 Settings (`/settings`)
File: `frontend/src/pages/Settings.tsx`

Fetches:
- `/health`

Displays/calculations:
- Health status badge
- AI configured flag
- Endpoint/model/key configured states
- Shows thresholds with defaults if not provided by health payload:
  - auto_merge_threshold default 0.9
  - manual_review_threshold default 0.7

## 5) Global Components That Affect All Pages

## 5.1 Sidebar
File: `frontend/src/components/layout/Sidebar.tsx`

- Polls `/summary` every 30s
- Uses summary counts for nav badges
- Health indicator derived from summary pipeline_health

## 5.2 Top Bar Live Source Pill
File: `frontend/src/components/layout/TopNavBar.tsx`

- Polls `/health` every 30s
- Shows Kafka and DB connectivity badges

## 5.3 AI Assistant Panel (Global)
File: `frontend/src/components/ui/AIAssistantPanel.tsx`

- Sends `/ai/chat` with page-context mapping from current route
- Context examples: pipeline, records, review, identity-graph, master-records, lineage, settings

## 6) Database Tables Used in Runtime

Created in `db_utils.py`:
- `db2_customer_simulated` (source)
- `bronze_customer` (raw vault)
- `silver_customer` (canonical)
- `duplicate_matches` (identity graph pairs)
- `review_queue` (human review)
- `gold_customer` (master records)
- `kafka_offsets` (offset tracking metadata)

## 7) Quick Troubleshooting for Score Interpretation

If you see odd percentages in UI, check scale assumptions:

1. Dedup feature scores are 0..1.
2. Dedup composite is 0..1.
3. ai_score is 0..100.
4. Some frontend views multiply values by 100 again.
5. Master confidence bar expects 0..1 but backend often provides 0..100.

This mismatch is a display-scale issue, not a matching algorithm issue.

## 8) Runtime Entry Points

Backend start:
- `./start_backend.sh` (prod)
- `./start_backend.sh dev` (reload)

Frontend start:
- In `frontend/`: `npm run dev`

Main entry files:
- Backend: `golden_record_platform/api/main.py`
- Frontend: `frontend/src/main.tsx`, `frontend/src/App.tsx`

## 9) Worked Examples: How Calculations Happen

This section shows numeric examples so the formulas above are easy to verify.

## 9.1 Example: Canonical Completeness

Input normalized record has:
- first_name: present
- last_name: present
- email: present
- phone: present
- birth_date: missing
- address: present
- city: present

Filled fields = 6 of 7

completeness_pct = round((6 / 7) * 100, 1) = 85.7

This value is stored in `silver_customer.completeness` by current transformer logic.

## 9.2 Example: Duplicate Feature + Composite + AI Score

Assume two records produce:
- email_match = 1.0
- phone_match = 0.0
- name_similarity = 0.90
- dob_match = 1.0
- city_similarity = 0.80

Composite:

composite =
  (1.0 * 0.35) +
  (0.0 * 0.30) +
  (0.90 * 0.20) +
  (1.0 * 0.10) +
  (0.80 * 0.05)

composite = 0.35 + 0 + 0.18 + 0.10 + 0.04 = 0.67

Candidate gate check:
- 0.67 >= 0.55, so pair is kept.

AI score:
- bonus applies only if phone_match=1 and dob_match=1
- here phone_match=0, so bonus=0

ai_score = min(100, 0.67 * 100 + 0) = 67

Decision:
- ai_score < 70 => SEPARATE

## 9.3 Example: Auto-Merge Case

Assume:
- email_match = 1
- phone_match = 1
- name_similarity = 0.95
- dob_match = 1
- city_similarity = 0.90

Composite:

composite =
  (1 * 0.35) +
  (1 * 0.30) +
  (0.95 * 0.20) +
  (1 * 0.10) +
  (0.90 * 0.05)

composite = 0.35 + 0.30 + 0.19 + 0.10 + 0.045 = 0.985

Bonus condition is true (phone and DOB exact): bonus=5

ai_score = min(100, 0.985 * 100 + 5) = min(100, 103.5) = 100

Decision:
- ai_score >= 90 => AUTO_MERGE

## 9.4 Example: Golden Group Confidence

Suppose approved group edges have ai_score values:
- 96
- 91
- 88

Group confidence = average = (96 + 91 + 88) / 3 = 91.67

Stored merge_confidence (rounded in merger code) => 91.7

Singleton records always get merge_confidence = 100.0.

## 9.5 Example: Command Center Donut Percentages

If summary says:
- auto_merged = 300
- manual_review = 150
- decided_separate = 50

total_decisions = 300 + 150 + 50 = 500

Displayed shares:
- auto = 300 / 500 = 60%
- review = 150 / 500 = 30%
- separate = 50 / 500 = 10%

## 9.6 Example: Why Some UI Scores Look Too High

Current scale mismatch pattern:

1. Backend often sends `composite_score` as ai_score-like value (0..100) in API formatting helpers.
2. Some UI components treat incoming value as 0..1 and multiply by 100 again.

If backend sends 87 and UI does `87 * 100`, display becomes 8700%.

Likewise for master confidence:
- backend confidence_score often in 0..100
- UI bar expects 0..1 and clamps >1 to 1
- result renders visually as 100% for many rows

## 10) Data Path Per Page (Calculation Perspective)

This is a compact map from page to calculation source.

1. Command Center
- Calculations primarily happen in backend SQL aggregates in `/summary` plus AI quality endpoint.
- Frontend mostly does presentation math (percent share in donut).

2. Pipeline Orchestration
- No dedup score math in page.
- Uses run result counts produced by pipeline stages in backend orchestrator.

3. Raw Vault Explorer
- No scoring; purely event metadata and payload inspection.

4. Canonical Explorer
- Completeness and validity are computed at transform time in silver stage.
- Page maps score to color bands and filtering.

5. Identity Graph
- Feature scores + weighted composite + ai_score all originate from dedup engine.
- Page renders bars and badges from backend-provided values.

6. Review Workbench
- Same identity scores as above.
- Adds decision actions and AI suggestion endpoint output.
- Optimistic UI updates queue before server confirmation.

7. Master Records
- Merge confidence originates in golden merger averaging approved edge scores.
- Page visualizes confidence, merged count, and source lineage columns.

8. Data Lineage
- No new scoring math; traces already-computed records and match decisions across stages.

9. Settings
- Displays threshold configuration and health metadata.
- Does not calculate dedup scores itself.
