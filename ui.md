# Golden Record Platform — Enterprise UI Specification
### For AI Code Generation | Version 1.0

---

## 🧠 Vision & Context

Build a **dark-mode, data-dense, enterprise command center** for a Customer Data Intelligence platform. This is not a typical SaaS dashboard — it is a **mission-critical operations platform** used by data engineers, CDOs, and CX analytics teams at large enterprises.

Think: Bloomberg Terminal meets Palantir Foundry meets a sci-fi control room. The UI must feel like it was built by a team that respects data as infrastructure.

**Core User Persona:**
- Data engineers running deduplication pipelines
- Data stewards reviewing match decisions
- CDOs monitoring data quality KPIs
- Platform administrators managing data health

**Emotional Goal:** When a user opens this platform, they should feel *in control of complex, living data*. Confidence. Clarity. Power.

---

## 🎨 Aesthetic Direction: "Dark Data Forge"

### Theme
- **Mode:** Dark-first, always
- **Palette:**
  - Background: `#080C14` (near-black, cold blue-black)
  - Surface 1: `#0D1320`
  - Surface 2: `#111927`
  - Border: `#1C2A3A`
  - Primary Accent: `#00E5FF` (electric cyan — the "data pulse" color)
  - Secondary Accent: `#7B61FF` (deep electric violet — AI/confidence signals)
  - Success: `#00F5A0` (neon mint — for auto-merged / high confidence)
  - Warning: `#FFB800` (amber — for manual review / medium confidence)
  - Danger: `#FF4567` (crimson — for rejected / low confidence)
  - Text Primary: `#E8F0FE`
  - Text Secondary: `#8899AA`
  - Text Muted: `#3D5166`

### Typography
- **Display/Headers:** `"Space Mono"` or `"IBM Plex Mono"` — monospace gives a data terminal feel for numbers, IDs, and stats
- **Body / Labels:** `"DM Sans"` — modern, clear, readable at small sizes
- **Code / IDs:** `"JetBrains Mono"` — for record IDs, match scores, SQL-style data

Never use: Inter, Roboto, Arial, system-ui defaults.

### Motion
- Animate numbers counting up on load (counter animation, 800ms ease-out)
- Pipelines flow left-to-right with animated progress pulses
- Match confidence bars fill on mount with easing
- Incoming data rows slide in with staggered `animation-delay` (20ms apart)
- Page transitions: fade + subtle upward translate (200ms)
- Pulsing dot indicator on live/active pipeline stages
- Scanning line animation over pipeline diagram when running

### Textures & Depth
- Subtle radial gradient glow on the primary accent color behind key metric cards (not overdone — just atmospheric)
- Fine grid dot pattern on background panels (SVG background-image, very low opacity ~4%)
- Card borders with subtle top-edge highlight: `border-top: 1px solid rgba(0,229,255,0.15)`
- Box shadows: `0 0 0 1px #1C2A3A, 0 4px 24px rgba(0,0,0,0.6)`
- No flat colors — every surface has a very subtle gradient overlay

---

## 🏗️ Application Architecture

### Layout Structure
```
┌─────────────────────────────────────────────────────────────┐
│  TOP NAV BAR  [Logo] [Data Source: Connected ●] [User] [⚙️] │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│  LEFT    │              MAIN CONTENT AREA                    │
│  SIDEBAR │                                                   │
│  NAV     │                                                   │
│          │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

### Left Sidebar (collapsed by default on smaller screens)
Width: 220px expanded, 60px icon-only collapsed

Nav Items (with icons):
1. **Overview** — Grid/dashboard icon
2. **Pipeline** — Flow/stream icon  
3. **Records** — Database icon (with sub-items: Raw, Cleaned, Golden)
4. **Match Intelligence** — Network/graph icon
5. **Review Queue** — Checkmark with badge count
6. **Data Lineage** — Branching lines icon
7. **Settings** — Gear icon

Bottom of sidebar: system health indicator (green pulsing dot), version tag.

### Top Navigation Bar
- Left: Logo — `◈ GOLDNREC` in monospace, cyan accent
- Center: **Data Source Status** pill — `● LIVE · kafka@localhost:9092 · 1,200 records` (green pulsing dot)
- Right: Last pipeline run timestamp + avatar/user menu

---

## 📄 Pages & Screens

---

### 1. OVERVIEW DASHBOARD (`/`)

**Purpose:** The command center. The first thing anyone sees. Must be impressive.

#### Layout: 3-zone grid
```
[ KPI STRIP — 5 cards spanning full width ]
[ PIPELINE DIAGRAM (60% width) | LIVE ACTIVITY FEED (40%) ]
[ DATA LAYER TABLE (40%) | MATCH SCORE DIST. CHART (30%) | DECISIONS DONUT (30%) ]
```

#### Zone 1 — KPI Strip (5 metric cards, horizontally equal)
Each card contains:
- Large animated counter number (count up on load)
- Abbreviated label below
- Subtle colored left-border indicating status
- Small delta badge (e.g., `+12 today`)

Cards:
| Metric | Label | Color |
|---|---|---|
| Total Raw Records | `db2_records` | Muted |
| Cleaned Records | `silver_records` | Cyan |
| Golden Records | `golden_records` | Success green |
| Pending Review | `manual_review` | Amber |
| Auto-Merged | `auto_merged` | Violet |

#### Zone 2 — Pipeline Flow Diagram
A horizontal pipeline visualization showing 5 stages:

```
[SOURCE] ──→ [BRONZE] ──→ [SILVER] ──→ [MATCHING] ──→ [GOLD]
   ●               ●            ●              ●            ●
 1,200           1,200         1,187          847          634
```

Each stage node:
- Rounded rectangle with icon
- Record count below
- Green if healthy, amber if degraded, pulsing cyan if currently processing
- Animated flowing particles between nodes when pipeline is running (CSS animation)
- Click on any stage → jumps to that records view

#### Zone 3 — Live Activity Feed (right panel)
A real-time-style event log showing latest pipeline events as rows:
```
● 00:02 ago  Auto-merged  [ID:4821] → [ID:4822]  conf: 97%
● 00:15 ago  Flagged for review  [ID:1103] ↔ [ID:2204]  conf: 81%
○ 01:32 ago  Pipeline run complete  1,200 records processed
```
- Each row slides in from right with stagger
- Color-coded dots: green=merged, amber=review, blue=info
- Clicking a row opens the match detail side panel

#### Zone 4 — Match Score Distribution (Bar Chart)
Horizontal bar chart showing confidence score buckets:
- 90–100%: auto-merge zone (green bars)
- 75–89%: review zone (amber bars)
- <75%: no match zone (muted bars)

Use a charting library (Recharts or Chart.js). Label the zones with overlaid text.

#### Zone 5 — Decision Donut (Donut Chart)
Three segments:
- Auto Merged (green)
- Manual Review (amber)
- Kept Separate (muted)

Center of donut: large number = total duplicate candidates found.

---

### 2. PIPELINE CONTROL (`/pipeline`)

**Purpose:** Run, monitor, and configure the deduplication pipeline. This is where engineers live.

#### Layout:
```
[ PIPELINE STATUS HEADER ]
[ PIPELINE CONFIG PANEL | PIPELINE RUN LOG ]
[ STAGE METRICS GRID ]
```

#### Pipeline Status Header
Full-width banner:
- Status badge: `● IDLE` / `◉ RUNNING` / `✓ COMPLETE` / `✗ FAILED`
- Last run: `2 min ago — 3.2s total`
- Large "▶ RUN PIPELINE" button (primary CTA, cyan, right-aligned)

#### Pipeline Config Panel
A form panel with:
- Toggle: **Reset All Layers** (yes/no) with description "Wipes existing processed data and reruns from source"
- Input: **Record Limit** (number input, empty = all) — label: "Process limit (leave empty for full dataset)"
- Toggle: **Dry Run Mode** — label: "Simulate without writing"
- Submit button

Visual: The form should look like a code config block — monospace font for labels, dark input fields with cyan focus ring.

#### Pipeline Run Log
A terminal-style output panel (scrollable):
```
[14:32:01] INFO  Pipeline initiated — reset_layers=true
[14:32:01] INFO  Connecting to data source kafka@localhost:9092
[14:32:02] INFO  Bronze layer: 1200 records ingested
[14:32:02] INFO  Silver layer: Cleaning 1200 records...
[14:32:03] INFO  Silver layer: 1187 records normalized
[14:32:03] INFO  Matching engine: Computing candidate pairs...
[14:32:04] INFO  Found 847 duplicate candidates
[14:32:04] INFO  Auto-merged: 634 pairs (conf ≥ 99%)
[14:32:04] INFO  Review queue: 213 pairs (conf 75–98%)
[14:32:04] SUCCESS  Golden records created: 521
[14:32:04] DONE  Pipeline complete in 3.2s
```
Style: dark terminal, monospace font, color-coded log levels (INFO=muted, SUCCESS=green, WARN=amber, ERROR=red). Slight scanline texture overlay.

#### Stage Metrics Grid
6 metric boxes arranged in 3x2 grid, showing post-run stats:
- Records in → Records out per layer
- % cleaned successfully (silver)
- Match rate
- Auto-merge rate
- Manual review rate

---

### 3. RECORDS EXPLORER (`/records`)

**Purpose:** Browse, inspect, and compare records across all data layers.

#### Layout:
```
[ LAYER TABS: Raw (DB2) | Bronze | Silver | Gold ]
[ SEARCH + FILTER BAR ]
[ DATA TABLE ]
[ RECORD DETAIL SIDE PANEL (slides in on row click) ]
```

#### Layer Tabs
Tab bar at top with counts:
- `Raw (DB2)` — 1,200
- `Bronze` — 1,200  
- `Silver` — 1,187
- `Gold ✨` — 521

Active tab highlighted with bottom border in cyan.

#### Search & Filter Bar
- Full-text search input (placeholder: "Search by name, email, phone, ID…")
- Filter chips: `+ Add Filter` → dropdown with field options
- Sort dropdown: field + direction
- `Export CSV` button (top right)

#### Data Table
Dense, scannable table. Columns vary by layer:

**Gold (Golden Records) columns:**
| # | Record ID | Full Name | Email | Phone | City | Source Records | Confidence | Last Updated |
|---|---|---|---|---|---|---|---|---|

- `Source Records` column: shows merged count as pill badge (e.g., `⊕ 3 merged`)
- Clicking a row opens the **Record Detail Panel**
- Alternating row shading (very subtle)
- Hovering a row: slight cyan left-border highlight
- Sticky header

**Silver (Cleaned) columns:** ID, Original Name → Cleaned Name, Email, Phone, DOB, City

Show a diff-style inline if cleaned value ≠ original (strikethrough original, bold cleaned).

#### Record Detail Side Panel
Slides in from the right (400px wide) on row click:

Header:
- Record ID (monospace)
- Full name large
- "Golden Record" or layer badge

Sections:
- **Identity Fields** (name, DOB, gender)
- **Contact** (email, phone)
- **Address** (city, zip, country)
- **Source Records** (if Gold): collapsible list of all merged source records with their IDs
- **Match History**: timeline of merge decisions
- **Raw JSON Toggle**: button to toggle raw JSON view of the record

---

### 4. MATCH INTELLIGENCE (`/matches`)

**Purpose:** The analytical heart of the platform. Show all duplicate pair detections with their confidence scores and signals.

#### Layout:
```
[ FILTER BAR: All | Auto-Merged | In Review | Rejected ]
[ MATCH CARDS GRID or TABLE TOGGLE ]
[ MATCH DETAIL EXPANDED VIEW ]
```

#### Filter / Status Bar
Horizontal filter tabs with counts:
- `All  (847)`
- `Auto-Merged  (634)` — green dot
- `In Review  (213)` — amber dot
- `Rejected  (0)` — red dot

#### Match Cards (Card View — default)
Grid of match cards, 2 columns:

Each card:
```
┌─────────────────────────────────────────────────┐
│  MATCH #4821 ↔ #4822             [AUTO-MERGED ✓] │
│─────────────────────────────────────────────────│
│  John Smith              Jon Smyth               │
│  john@acme.com           john@acme.com           │
│  +1-800-555-0101         +1-800-555-0101         │
│─────────────────────────────────────────────────│
│  SIGNAL BREAKDOWN                                │
│  Phone Match    ████████████████████  100%       │
│  Email Match    ████████████████████  100%       │
│  Name Fuzzy     ████████████░░░░░░░░   72%       │
│  DOB Match      ████████████████████  100%       │
│─────────────────────────────────────────────────│
│  Overall Confidence          ████████████  97%   │
└─────────────────────────────────────────────────┘
```

Signal bars: filled with color matching confidence (green >90, amber 70–90, red <70)
Status badge: `AUTO-MERGED` (green), `PENDING REVIEW` (amber), `REJECTED` (red)

#### Table View (toggle)
Dense table with columns:
Match ID | Record A | Record B | Phone | Email | Name Similarity | Overall Score | Status | Actions

---

### 5. REVIEW QUEUE (`/review`)

**Purpose:** The human-in-the-loop decision center. The most workflow-intensive screen.

This is where data stewards spend most of their time.

#### Layout:
```
[ QUEUE STATS BANNER ]
[ SPLIT COMPARISON VIEW ]
[ SIGNAL DETAIL + DECISION PANEL ]
```

#### Queue Stats Banner
- `213 matches pending review`
- Progress: `12 of 213 reviewed today`
- Progress bar
- Estimated time: `~18 min remaining` (at 5s per decision)
- Keyboard shortcut hint: `← Reject  →  Approve`

#### Split Comparison View (Main Area)
Two-column layout — Record A | Record B — side by side:

```
┌─────────────────────────┬─────────────────────────┐
│     RECORD #1103        │     RECORD #2204        │
│─────────────────────────│─────────────────────────│
│  Name:  Sarah Johnson   │  Name:  Sara Johnston   │
│  Email: sj@gmail.com    │  Email: sj@gmail.com    │
│  Phone: 555-0192        │  Phone: 555-0193        │
│  DOB:   1990-04-12      │  DOB:   1990-04-12      │
│  City:  Austin, TX      │  City:  Austin TX       │
└─────────────────────────┴─────────────────────────┘
```

Matching fields: highlight identical values in green
Differing fields: highlight differences in amber
Fields that are close but not identical: amber underline

#### Signal Detail + Decision Panel (below comparison)
Horizontal signal breakdown bars (same as match card style) + big decision buttons:

```
[ ✗ REJECT — Keep Separate ]        [ ✓ APPROVE — Merge Records ]
```

- Reject: dark red button, left-aligned
- Approve: bright cyan/green button, right-aligned
- Large, can't miss them
- Keyboard: `A` = Approve, `R` = Reject, `S` = Skip

After decision: card animates out, next match loads in with slide animation.

Progress counter updates live: `213 → 212`

#### Sidebar (right, collapsible)
Queue list — all pending items as a scrollable list. Clicking any jumps to it. Currently active item highlighted.

---

### 6. DATA LINEAGE VIEW (`/lineage`)

**Purpose:** A visual graph showing how records flow and merge across layers. Impressive for executive demos.

#### Main Visualization
An interactive node graph (use D3.js or a graph library like Cytoscape.js):

- **Source nodes** (circles): raw input records
- **Layer nodes** (squares): processing stages
- **Golden Record nodes** (stars/hexagons): final merged output
- Edges: flowing animated lines showing data movement
- Color-coded by status

Controls:
- Zoom in/out
- Click a node to highlight its lineage path
- Filter by: layer, merge status, confidence range
- Export as PNG button

This screen is primarily a "wow" feature — used in sales demos and executive reviews.

---

## 🔴 Live Data Source Connection Indicator

**This is a KEY enterprise differentiator.**

Show in the top nav bar and pipeline page:

```
◉ LIVE DATA SOURCE
kafka@localhost:9092  |  Topic: customer-events  |  Lag: 0ms  |  1,200 records ingested
```

Pill component behavior:
- Green pulsing dot when connected and receiving data
- Amber dot when connected but idle
- Red dot when disconnected
- Clicking it opens a **Data Source Details** popover:
  - Connection string
  - Topic/table name
  - Messages/sec (last 60s sparkline chart)
  - Total records ingested
  - Connection uptime
  - `Reconnect` button

This signals to enterprise buyers that this is a real streaming data platform, not a file-upload tool.

---

## ⚡ Micro-interactions & Delight Details

1. **Pipeline Run button:** When clicked, button text changes to `◉ Running…` with a pulsing dot. Disabled state with spinner.

2. **Confidence Score Bars:** On mount, bars animate from 0 → value with cubic-ease-out (600ms stagger)

3. **Record count badges:** Numbers count up from 0 when component mounts (800ms ease-out)

4. **Match cards:** On hover, the card elevates slightly with a stronger glow on the border

5. **Review decisions:** After Approve/Reject, the card flips/fades out and the next one slides in (CSS 3D flip or horizontal slide)

6. **Pipeline running state:** A horizontal scanning line animation sweeps across the pipeline flow diagram when processing

7. **Toast notifications:** Bottom-right toast for actions: "✓ Match #4821 approved", "Pipeline started", etc. Auto-dismiss 4s.

8. **Empty states:** If review queue is empty — large centered celebration state: `🎉 Queue cleared! All 213 matches reviewed.`

9. **Skeleton loaders:** All tables and charts show shimmer skeleton while loading, never blank white flash

10. **Keyboard shortcuts legend:** Press `?` anywhere → modal with all shortcuts listed

---

## 🔌 API Integration Map

| UI Action | API Endpoint | Method |
|---|---|---|
| Load dashboard KPIs | `/summary` | GET |
| Run pipeline | `/pipeline/run` | POST |
| Load raw records | `/records/db2` | GET |
| Load cleaned records | `/records/silver` | GET |
| Load golden records | `/records/gold` | GET |
| Load bronze records | `/records/bronze` | GET |
| Load all matches | `/matches` | GET |
| Load review queue | `/review-queue` | GET |
| Submit review decision | `/review/decide` | POST |
| Rebuild golden layer | `/rebuild/golden` | POST |
| Health check | `/health` | GET |
| System info | `/info` | GET |

**Base URL:** `http://localhost:8000`

**Polling strategy:**
- `/health` — poll every 30s, show connection status
- `/summary` — poll every 10s when pipeline is running, every 60s at idle
- `/review-queue` — poll every 5s when on review page

**Review Decide payload:**
```json
{
  "match_id": "string",
  "decision": "approve" | "reject"
}
```

**Pipeline Run payload:**
```json
{
  "reset_layers": true | false,
  "produce_limit": number | null
}
```

---

## 🧩 Component Library Checklist

Build these reusable components:

- `<KpiCard>` — metric, label, delta badge, colored border
- `<PipelineFlow>` — animated horizontal stage diagram
- `<ConfidenceBar>` — labeled progress bar with color thresholds
- `<MatchCard>` — dual-record comparison card with signal breakdown
- `<RecordTable>` — sortable, filterable, selectable data table
- `<StatusBadge>` — auto-merged/pending/rejected pill
- `<LiveSourcePill>` — data source connection status
- `<TerminalLog>` — scrollable monospace log output panel
- `<ReviewComparison>` — side-by-side record diff view
- `<DecisionButtons>` — approve/reject with keyboard support
- `<ToastContainer>` — notification system
- `<SkeletonLoader>` — shimmer placeholder for tables/cards
- `<SidePanel>` — slide-in detail panel from right

---

## 🛠️ Recommended Tech Stack

| Layer | Recommendation |
|---|---|
| Framework | React 18 + TypeScript |
| Styling | Tailwind CSS + CSS Variables for theme tokens |
| Charts | Recharts (bar, donut) + D3.js (lineage graph) |
| State | Zustand or React Query for server state |
| Animations | Framer Motion |
| Icons | Lucide React |
| Fonts | Google Fonts: IBM Plex Mono + DM Sans |
| HTTP | Axios with polling via React Query |
| Routing | React Router v6 |

---

## 🚫 Anti-Patterns to Avoid

- ❌ No white backgrounds anywhere
- ❌ No light mode (enterprise data tools are dark)
- ❌ No purple gradients (overused AI aesthetic)
- ❌ No rounded pill-everything design
- ❌ No emoji in production data rows
- ❌ No auto-refreshing entire page (only targeted component refresh)
- ❌ No modal-heavy workflows (use side panels instead)
- ❌ No generic card grids for everything — vary the layouts per page

---

## ✅ Definition of Done

The UI is complete when:

1. All 6 pages are implemented and navigable
2. All API endpoints are wired up with real data
3. Review workflow is fully functional (approve/reject, queue updates)
4. Pipeline can be triggered and status is shown live
5. All animations are present (counters, bars, cards)
6. Keyboard shortcuts work in review queue
7. Data source connection indicator is visible and accurate
8. Responsive down to 1280px width (wide monitor enterprise assumption)
9. No hardcoded data — all values come from API
10. Loading and error states handled for every API call

---

*This specification is intended for AI-assisted frontend generation. Each section is self-contained and can be built independently. Start with the Overview Dashboard, then Pipeline, then Records, then Match Intelligence, then Review Queue.*