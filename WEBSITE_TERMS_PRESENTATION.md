# Golden Record Platform - Presentation Guide (Non-Technical)

This guide explains every major term shown in the website, what it means in simple words, how each part is connected, and how the platform works end-to-end.

## 1) One-Line Story
The platform takes messy customer data from different places, cleans it, finds duplicate people, asks a human to review uncertain matches, and creates one trusted master record per real person.

## 2) What You See on the Screen (UI Terms)

### Brand and Header Terms
- GOLDNREC: The platform name shown in the top bar.
- DataFusion Intelligence Platform: The full product identity shown in the sidebar.
- LIVE: Means backend/API health is active and responding.
- DISCONNECTED: Means the frontend cannot reach the backend.
- kafka@localhost:9092: The streaming data pipeline connection label.
- 1,200 records: Current loaded source record volume.
- Last run: Shows how recently the pipeline was executed.

### Sidebar Navigation Termss
- Command Center: Main dashboard for overall status and KPIs.
- Orchestration: Page where you run and monitor pipeline stages.
- Raw Vault: Immutable raw data layer (exactly what arrived).
- Canonical Layer: Cleaned and standardized customer data.
- Identity Graph: Candidate duplicate relationships between customers.
- Master Records: Final trusted golden records.
- Review Workbench: Human review page for uncertain matches.
- Data Lineage: Visual trace of where a record came from and how it changed.
- Settings: Configuration and environment controls.
- API Connected / API Degraded: Current system health indicator.

## 3) Data Layers in Simple Language
- Source Records: Original incoming data before processing.
- Vault Records: Raw events stored safely with no edits.
- Canonical Records: Cleaned, normalized version of data.
- Identity Matches: Pairs the system believes may be the same person.
- Pending Review: Matches that need human approval.
- Master Records: Final merged records used by business teams.

How they connect:
Source -> Vault -> Canonical -> Identity -> Review/Decision -> Master

## 4) Pipeline Stage Terms (What Happens in Order)
- Ingestion: Reads data from source and receives events.
- Raw Vault stage: Stores raw incoming records exactly as received.
- Canonical stage: Cleans names, emails, phone numbers, dates, and addresses.
- Identity Graph stage: Scores similarity and finds likely duplicates.
- Decision Engine stage: Classifies matches as auto-merge, review, or separate.
- Master stage: Builds final golden records from approved links.

## 5) Matching and Decision Terms
- Auto Merged: High-confidence duplicates merged automatically.
- Manual Review: Medium-confidence duplicates sent to a human.
- Separate: Low-confidence pairs kept as different people.
- Confidence Score: How sure the system is that two records are same person.
- Signals: Individual factors used in matching (email, phone, name, DOB, city).
- Match Reasoning: Human-readable reason why a pair was scored that way.

## 6) Review Workbench Terms
- Approve: Confirm these two records are the same person.
- Reject: Confirm these two records are different people.
- Pending: Waiting for reviewer action.
- Approved: Reviewer accepted merge.
- Rejected: Reviewer denied merge.
- Review Queue: List of all pending decisions.

How it connects:
Identity Graph produces uncertain pairs -> Review Workbench resolves them -> Master Records update.

## 7) Data Lineage Terms
- Lineage: Complete path of one customer record through all stages.
- Source Node: Where the record started.
- Vault Node: Raw event copy.
- Canonical Node: Cleaned version.
- Identity Node: Match links to other similar records.
- Master Node: Final merged business record.

Why it matters:
Lineage gives trust and auditability. You can explain every final value by tracing its origin.

## 8) KPI and Chart Terms (Dashboard)
- Source Records KPI: Total incoming records.
- Vault Records KPI: Total raw stored records.
- Canonical KPI: Total cleaned records.
- Identity Matches KPI: Number of possible duplicate links.
- Pending Review KPI: Count waiting for human action.
- Master Records KPI: Final unique records count.
- Funnel Chart: Shows count flow from source to master.
- Decision Donut: Split of auto-merge vs review vs separate.
- Quality Score: Health indicator of data quality and confidence.

## 9) Raw Vault Page Terms
- Immutable: Records cannot be edited here.
- Kafka Metadata: Stream details (offset, partition, source system, ingest time).
- Raw Payload: Original event JSON body.
- Source Systems: Upstream systems that contributed data.
- Total Records: Count currently stored in Raw Vault.

## 10) Canonical Layer Terms
- Standardized Name: Normalized formatting for names.
- Standardized Email: Lowercased and validated email.
- Standardized Phone: Consistent phone format.
- Cleaned Address: Normalized city/state/address fields.
- Completeness: How many key fields are present.

## 11) Identity Graph Terms
- Node: One customer record.
- Edge/Link: A possible duplicate relationship between two records.
- Cluster: Group of linked records likely representing one person.
- Connected Component: Technical name for one cluster.

## 12) Master Records Terms
- Master ID: Unique ID of final trusted record.
- Full Name: Chosen best representation for the customer name.
- Email Primary: Main selected email.
- Emails All: All known emails gathered from linked records.
- Source IDs: Original IDs that were merged into this master record.
- Source Systems: Systems that contributed to this master record.
- Record Count: Number of source records merged into one master.

## 13) Operations and Monitoring Terms
- Pipeline Run: One full execution of all stages.
- Stage Status: idle, running, complete, error.
- Duration: Time taken by a stage or full run.
- History: Previous run summaries.
- Refresh: Reload latest backend data.

## 14) AI Assistant and Smart Features Terms
- AI Assistant: In-app helper for questions and guidance.
- AI Suggest: Model suggestion for review decisions.
- Data Quality Report: AI-generated quality summary.
- Explain Merge: Natural-language explanation of why records were merged.

## 15) API/Integration Terms (Plain Language)
- API: The backend service the UI talks to.
- Endpoint: A specific URL action (for example, summary, run, review).
- Request: Frontend asking backend for data/action.
- Response: Backend answer returned to frontend.
- SSE Events: Live progress messages while pipeline runs.

## 16) End-to-End Business Flow (Presentation Script)
Use this exactly in demos:
1. We ingest customer data from source systems.
2. We store an untouchable raw copy in Raw Vault for traceability.
3. We clean and standardize data in Canonical Layer.
4. We detect likely duplicates in Identity Graph.
5. We auto-merge high-confidence pairs.
6. We send uncertain pairs to Review Workbench for human decision.
7. We build trusted Master Records from approved links.
8. We keep full Data Lineage so every final record is auditable.

## 17) Why This Matters to Business
- Better customer experience: One customer view, fewer duplicate contacts.
- Better reporting: Reliable counts and cleaner analytics.
- Better compliance: Full traceability from source to master.
- Better operations: Human review only where needed, automation for the rest.

## 18) Quick Q&A (For Non-Technical Audience)
- What is a master record?
One final trusted profile for one real customer.

- Why do we need review workbench?
Because some matches are uncertain and need human judgment.

- Can we trust the final data?
Yes, because every value has lineage and audit trace.

- Is this replacing humans?
No. It automates obvious cases and escalates uncertain cases to people.

## 19) 2-Minute Closing Summary
This platform converts scattered, duplicate customer records into one trusted customer truth. It combines automation, AI scoring, and human review, while keeping a full audit trail. The result is higher data quality, lower duplicate risk, and better business decisions.
