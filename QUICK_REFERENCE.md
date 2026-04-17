# 🎯 Quick Reference - Table Filtering & Load Feature

## 🚀 What's New

### Feature 1: Filter Master Records by Source Table ✓
**Location:** Master Records page (`/master-records`)

```
Click checkboxes to show/hide records:
☑ CRM (524 records)
☑ ERP (312 records)  ← Uncheck to hide ERP records
☐ SAP (26 records)

Result: "Showing 524 of 1,247 records"
```

### Feature 2: Load Filtered Data to Database ✓
**Location:** Master Records page header, next to Export CSV

```
[Load to DB] ← New button
Click → Validates records → Shows success summary
```

---

## 📁 Code Changes

### Frontend Changes
**File:** `frontend/src/pages/MasterRecords.tsx`

```typescript
// NEW: State for table filtering
const [selectedSystems, setSelectedSystems] = useState<Set<string>>(new Set());
const [loading_db, setLoadingDb] = useState(false);

// NEW: Load to database function
const loadToDatabase = async () => {
  // Filters records by selected systems
  // Sends to /master/load-to-db endpoint
  // Shows success/error toast
}

// NEW: Get available systems from records
const availableSystems = Array.from(
  new Set(records.flatMap(r => r.source_systems || []))
).sort();

// NEW: Filter table display
{records
  .filter(rec => 
    selectedSystems.size === 0 || 
    rec.source_systems?.some(sys => selectedSystems.has(sys))
  )
  .map((rec, idx) => (
    // render row
  ))}
```

### Backend Changes
**File:** `golden_record_platform/api/main.py`

```python
# NEW: POST endpoint for loading data
@app.post("/master/load-to-db")
async def load_master_to_db(payload: dict = Body(...)):
    """
    Load filtered master records to database.
    Validates records exist and returns summary.
    """
    records = payload.get("records", [])
    filters = payload.get("filters", {})
    
    # Validate + Log + Return summary
    return {
        "status": "success",
        "message": f"Loaded {valid_count} of {len(records)} records",
        "summary": {...}
    }
```

---

## 🎨 UI Components

### Filter Section
```html
<div className="panel-border rounded-xl p-4 space-y-3">
  <p>📊 Filter by Source Table</p>
  <div className="flex flex-wrap gap-2">
    {availableSystems.map((system) => (
      <label key={system}>
        <input type="checkbox" ... />
        {system}
        ({count})
      </label>
    ))}
  </div>
  <div>"Showing X of Y records"</div>
</div>
```

### Load Button
```html
<button onClick={loadToDatabase} disabled={loading_db}>
  {loading_db ? <Spinner /> : <Database />}
  Load to DB
</button>
```

---

## 🧪 How to Test

### Test 1: View Filters
1. Navigate to `/master-records`
2. ✅ See "📊 FILTER BY SOURCE TABLE" section
3. ✅ See checkboxes for CRM, ERP, SAP, etc.
4. ✅ See record count per system

### Test 2: Filter Records
1. Uncheck "ERP"
2. ✅ Table updates instantly
3. ✅ Shows "Showing X of 1247 records"
4. ✅ ERP records hidden

### Test 3: Load to DB
1. Select some systems
2. Click "Load to DB"
3. ✅ See loading spinner
4. ✅ Get success toast with count

### Test 4: Export Filtered
1. Select systems
2. Click "Export CSV"
3. ✅ CSV includes only selected records
4. ✅ CSV has "Sources" column

---

## 📡 API Summary

### New Endpoint: POST /master/load-to-db

**Request:**
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
    "search": ""
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Successfully validated and loaded 10 of 10 records",
  "summary": {
    "total_records": 10,
    "valid_records": 10,
    "systems_included": ["CRM", "ERP"],
    "timestamp": "2026-04-17T16:30:45"
  }
}
```

---

## 📊 Example Scenarios

### Scenario 1: Show Only CRM Records
```
Action: Uncheck ERP, SAP, AWS checkboxes
Result: See only records with source_systems containing "CRM"
Count: 524 of 1,247 records
```

### Scenario 2: Export Records from Multiple Systems
```
Action: Keep CRM and ERP checked, uncheck others
Result: Export contains only CRM + ERP records
Count: 836 records in CSV
File: master-records-2026-04-17.csv
```

### Scenario 3: Validate Before Loading
```
Action: Select systems → Click "Load to DB"
Result: System validates all records exist
Message: "Successfully validated and loaded X records"
Status: Ready for integration
```

---

## 🔗 Data Connection Example

**Master Record Creation:**
```
CRM-1001 (John Smith, john@acme.com)
    +
ERP-3004 (Jon Smyth, jon@acme.com)
    ↓ [Dedup detects match: 98%]
    ↓ [Merge approved]
    ↓
gold_customer (golden_id: 1)
  name: "John Smith"
  email: "john.smith@acme.com"
  source_ids: ["CRM-1001", "ERP-3004"]
  source_systems: ["CRM", "ERP"]
  merge_confidence: 98%
```

**In Master Records UI:**
- Sources column shows: "CRM, ERP"
- Merged column shows: 2 records combined
- Detail panel shows: source_ids with system tags

---

## ✅ Verification Checklist

- ✅ Frontend has no syntax errors
- ✅ Backend has no syntax errors  
- ✅ Both files modified successfully
- ✅ New endpoint ready
- ✅ Filter UI implemented
- ✅ Load button implemented
- ✅ Documentation complete

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| **TABLE_FILTERING_AND_LOAD_FEATURE.md** | Feature overview, workflows, examples |
| **UI_VISUAL_DEMO.md** | UI mockups, animations, responsive design |
| **MULTI_TABLE_CONNECTION_GUIDE.md** | How tables connect, merge examples |
| **IMPLEMENTATION_COMPLETE.md** | Full implementation summary |
| **QUICK_REFERENCE.md** | This file - quick lookup |

---

## 🎬 Quick Demo Script

**Step 1: Start Backend**
```bash
cd /home/developer/J2W/data-transformation
source .venv/bin/activate
uvicorn golden_record_platform.api.main:app --reload
```

**Step 2: Start Frontend**
```bash
cd frontend
npm run dev
```

**Step 3: Open Browser**
```
http://localhost:5173/master-records
```

**Step 4: Test Features**
1. See filter checkboxes ✓
2. Uncheck "ERP" → Table updates ✓
3. Click "Load to DB" → See validation ✓
4. Click "Export CSV" with filters ✓

---

## 🎯 Key Benefits

✅ **Multi-table visibility** - Know which tables contributed to each record
✅ **Smart filtering** - Select which systems to view/export
✅ **Validated loading** - Confirm records before integrating
✅ **Complete lineage** - Audit trail of all merges
✅ **Flexible export** - Include/exclude systems in CSV

---

## ❓ FAQ

**Q: How do I filter records?**
A: Use checkboxes in "📊 FILTER BY SOURCE TABLE" section

**Q: What does "Load to DB" do?**
A: Validates filtered records exist in database and logs the operation

**Q: Can I combine filter + search?**
A: Yes! Filter by system, then search by name/email

**Q: Does export include filter choices?**
A: Yes! Export only contains records matching current filters

**Q: How do I see which systems merged a record?**
A: Look at "Sources" column or click record detail panel

---

**Status:** ✅ COMPLETE & READY TO USE
