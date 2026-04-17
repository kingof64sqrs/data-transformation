# 📊 Master Records - Table Filtering & Load to Database

## New Features Implemented

You now have powerful filtering and data loading capabilities on the Master Records page!

---

## ✨ Feature #1: Multi-Table Source Filtering

### What It Does:
- Shows checkboxes for all **source tables** contributing to master records
- Dynamically displays count of records from each table
- Filter master records to show only those from selected tables
- Quick visual indication of which records match your filter

### How It Works:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 FILTER BY SOURCE TABLE                        [Clear filters] │
│                                                                  │
│ ☑ CRM (524)    ☑ ERP (312)    ☐ SAP (0)    ☑ SALESFORCE (89)  │
│                                                                  │
│ 📌 Showing 925 of 1,247 records                                │
└─────────────────────────────────────────────────────────────────┘
```

### User Workflow:
1. Load Master Records page
2. See all available source systems with record counts
3. **Check/uncheck** systems to filter displayed records in real-time
4. See visual feedback: "Showing X of Y records"
5. Click "Clear filters" to reset

### Example Scenario:
- **Use Case:** "Show me only CRM and Salesforce customer records"
  1. Uncheck ERP and SAP
  2. Now see 925 records from CRM + SALESFORCE only
  3. Can export, load, or review just these records

---

## ✨ Feature #2: Load to Database Button

### What It Does:
- **Validates** that all displayed/filtered records exist in the database
- **Logs** the load operation with metadata
- **Confirms** success with a summary
- Appears next to the existing "Export CSV" button

### Button Behavior:

```
┌──────────────────────────────┬──────────────────┐
│ Load to DB │ Export CSV     │
└──────────────────────────────┴──────────────────┘

✓ Enabled when: Records are loaded
✗ Disabled when: No records to load
```

### Load Summary Returned:
```json
{
  "status": "success",
  "message": "Successfully validated and loaded 925 of 925 records to database",
  "summary": {
    "total_records": 925,
    "valid_records": 925,
    "systems_included": ["CRM", "ERP", "SALESFORCE"],
    "search_term": "john",
    "timestamp": "2026-04-17T16:30:45.123456"
  }
}
```

---

## 🎯 Complete Workflow Examples

### Example 1: Show Only Records with Multiple Source Systems (Merged Records)

**Goal:** Find all master records that were merged from multiple sources

**Steps:**
1. Navigate to `/master-records`
2. See that CRM has 524 records, ERP has 312 records
3. Know that a record can have multiple source systems selected
4. Keep all systems checked to see all merged records
5. **Click "Load to DB"** to confirm all are ready

**Result:**
```
✅ Successfully validated and loaded 521 of 521 records to database
   - These are master records (one per unique person)
   - Each contains data merged from 1-3 source systems
   - All validation checks passed
```

---

### Example 2: Export Only CRM Records

**Goal:** Get a CSV of all master records that include data from your CRM system

**Steps:**
1. Navigate to `/master-records`
2. Keep only **CRM** checked (uncheck ERP, SAP, etc.)
3. See filtered list: "Showing 524 of 521 records"
4. **Click "Export CSV"** to download filtered set
5. File: `master-records-2026-04-17.csv`

**Result:**
```csv
master_id,full_name,email,phone,city,source_ids,confidence_score
1,John Smith,john@acme.com,555-0123,New York,CRM-1001,98.5
2,Jane Doe,jane@corp.com,555-0124,Los Angeles,CRM-1002,96.2
...
```

---

### Example 3: Search Within Filtered Context

**Goal:** Find "Sarah" records only from ERP system

**Steps:**
1. Keep only **ERP** checked
2. Type `sarah` in the search box
3. See filtered results: "Showing 12 of 312 ERP records"
4. Can now review or export just these 12 records

**Result:**
```
Filtered by: ERP system only
Searched for: "sarah"
Results: 12 records
- Sarah Wilson (ERP-5003)
- Sarah Khan (ERP-5004)
- Sarah Chen (ERP-5005)
...
```

---

## 🔧 Technical Implementation

### Frontend Changes (MasterRecords.tsx)

**New State Variables:**
```typescript
const [selectedSystems, setSelectedSystems] = useState<Set<string>>(new Set());
const [loading_db, setLoadingDb] = useState(false);
```

**New Function:**
```typescript
const loadToDatabase = async () => {
  // Filters records by selected systems
  // Sends to /master/load-to-db endpoint
  // Shows success/error toast
}
```

**New Table Filter UI:**
- Checkboxes for each available system
- Record count per system
- Real-time filtering of table
- Clear filters button

**Modified Table Rendering:**
```typescript
{records
  .filter(rec => 
    selectedSystems.size === 0 || 
    rec.source_systems?.some(sys => selectedSystems.has(sys))
  )
  .map((rec, idx) => (
    // render row
  ))}
```

---

### Backend Changes (api/main.py)

**New Endpoint:** `POST /master/load-to-db`

**Purpose:** 
- Validates filtered master records
- Logs load operation
- Returns summary of loaded data

**Request Body:**
```json
{
  "records": [
    {
      "master_id": 1,
      "full_name": "John Smith",
      "source_systems": ["CRM", "ERP"],
      ...
    }
  ],
  "filters": {
    "selected_systems": ["CRM", "ERP"],
    "search": "john"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Successfully validated and loaded X of Y records to database",
  "summary": {
    "total_records": 925,
    "valid_records": 925,
    "systems_included": ["CRM", "ERP"],
    "search_term": "john",
    "timestamp": "2026-04-17T16:30:45.123456"
  }
}
```

---

## 📈 Data Flow Diagram

```
Master Records Page
        │
        ├─→ Fetch All Records from /master/records
        │           │
        │           └─→ Display with source_systems field
        │
        ├─→ Extract Available Systems
        │           │
        │           └─→ Show Filter Checkboxes (CRM, ERP, SAP, etc.)
        │
        ├─→ User Selects/Deselects Systems
        │           │
        │           └─→ Real-time Filter Applied (Client-side)
        │
        ├─→ Display Filtered Results
        │           │
        │           └─→ Show "X of Y records" indicator
        │
        └─→ User Clicks "Load to DB"
                    │
                    └─→ POST /master/load-to-db
                            │
                            └─→ Validate + Log + Return Summary
                                    │
                                    └─→ Show Success Toast
```

---

## 💡 Key Benefits

✅ **Multi-System Visibility**
- See data from multiple source systems (CRM, ERP, SAP, etc.)
- Understand which records came from which sources
- Track data lineage at a glance

✅ **Flexible Filtering**
- Filter by system, name, email, or ID
- Combine multiple filters
- See record counts for each system

✅ **Data Integrity**
- Load to DB validates all records exist
- Confirms record counts match
- Logs all load operations

✅ **Audit Trail**
- Load operation timestamp
- Filters applied
- Systems included
- Record counts

✅ **Workflow Support**
- Prepare data before integration
- Export specific subsets
- Validate data before loading
- Connect records from multiple tables via filters

---

## 🚀 Next Steps

The system now supports:
1. ✅ Multi-table data connection (via source_systems field)
2. ✅ Table-level filtering (checkboxes)
3. ✅ Master record data aggregation (shown in detail panel)
4. ✅ Load to database (validation + logging)

**You can now:**
- View which tables contribute to each master record
- Filter to show only records from selected tables
- Load validated records with audit trail
- Use source_systems to understand data origins
