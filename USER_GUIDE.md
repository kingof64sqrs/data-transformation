# Golden Record Platform - User Guide

**For Everyone (Non-Technical & Technical)**

---

## 🎯 What Is This Platform?

Imagine you have a list of customer records, but some customers appear multiple times with slightly different information:
- "John Smith" and "Jon Smyth" (same person, spelled differently)
- Same email but different phone number
- Same phone but different address

This platform **automatically finds duplicate customers** and **creates one unified "Golden Record"** for each real person.

---

## 📊 How It Works (Simple Explanation)

Think of it like a cleaning process with these steps:

```
Your messy customer data
        ↓
Step 1: Collect all records
        ↓
Step 2: Clean & standardize names, emails, phone numbers
        ↓
Step 3: Compare records to find duplicates
        ↓
Step 4: Run through AI scoring (is this the same person?)
        ↓
Step 5: Three outcomes:
        • Automatic merge (99% sure it's the same person)
        • Manual review (75% sure - needs human approval)
        • Keep separate (not the same person)
        ↓
Create one perfect "Golden Record" per person
```

---

## 🚀 Getting Started (5 Minutes)

### Step 1: Start the System
Open your terminal and run:
```bash
./start_backend.sh
```

**What to expect:** You'll see messages like "Application startup complete" and the server is ready to use.

### Step 2: Open the API Interface
In your web browser, go to:
```
http://localhost:8000/docs
```

You'll see a page with all available functions (like a control panel).

### Step 3: Run the Pipeline
Click on the blue button that says **POST /pipeline/run**
- Click "Try it out"
- Click "Execute"
- Wait about 3-5 seconds
- You'll see results showing how many duplicates were found

---

## 🎮 What You Can Do (Endpoints Explained Simply)

Think of "endpoints" as buttons you can click to get information or do things.

### **1. Check If System Is Running**
📍 **Endpoint:** `GET /health`
**What it does:** Confirms the system is up and working
**How to use:** Click "Try it out" → "Execute"
**You'll get:** A message saying "healthy"

---

### **2. Get System Overview**
📍 **Endpoint:** `GET /summary`
**What it does:** Shows you how many records are in each stage of the cleaning process
**How to use:** Click "Try it out" → "Execute"
**You'll see:**
- 🔵 How many raw records came in
- 🟡 How many were cleaned
- 🟢 How many golden records were created
- 📋 How many duplicates were found

---

### **3. Run the Cleaning Process**
📍 **Endpoint:** `POST /pipeline/run`
**What it does:** Starts the entire cleaning and duplicate-finding process
**How to use:** 
- Click "Try it out"
- You can change these settings:
  - `reset_layers`: true or false (start fresh or keep previous data)
  - `produce_limit`: number (how many records to process, leave empty for all)
- Click "Execute"

**Result:** Shows statistics like:
- How many records matched
- How many were auto-merged
- How many need manual review

---

### **4. View Raw Records**
📍 **Endpoint:** `GET /records/db2`
**What it does:** Shows the original, unprocessed customer records
**How to use:** Click "Try it out" → You can change limit (how many to show) → "Execute"
**Example:** Default shows 100 records

---

### **5. View Cleaned Records**
📍 **Endpoint:** `GET /records/silver`
**What it does:** Shows records after they've been cleaned and standardized
**How to use:** Click "Try it out" → Change limit if you want → "Execute"
**You'll see:** Names in proper format, phones formatted correctly, etc.

---

### **6. View Unified Records (The Goal!)**
📍 **Endpoint:** `GET /records/gold`
**What it does:** Shows the final, merged "Golden Records" (one per person)
**How to use:** Click "Try it out" → "Execute"
**This is your result!** ✨

---

### **7. View Found Duplicates**
📍 **Endpoint:** `GET /matches`
**What it does:** Shows pairs of records that look like the same person
**How to use:** Click "Try it out" → "Execute"
**You'll see:**
- Record 1 vs Record 2
- Confidence score (0-100)
- Decision (auto-merged or pending review)

---

### **8. Review Questionable Matches**
📍 **Endpoint:** `GET /review-queue`
**What it does:** Shows duplicates that need human approval (confidence is medium, not high)
**How to use:** Click "Try it out" → "Execute"
**You'll see:** 
- Two similar records side-by-side
- Names, emails, phone numbers

---

### **9. Approve/Reject a Match**
📍 **Endpoint:** `POST /review/decide`
**What it does:** Let you say "Yes, merge these" or "No, keep them separate"
**How to use:**
- Click "Try it out"
- Enter the match_id (from review queue)
- Enter decision: `"approve"` or `"reject"`
- Click "Execute"

**This is where YOU (the human) help the system!**

---

### **10. View Processing History**
📍 **Endpoint:** `GET /records/bronze`
**What it does:** Shows all raw records that came into the system
**How to use:** Click "Try it out" → "Execute"
**This tracks:** Every record received and when

---

### **11. Rebuild Results**
📍 **Endpoint:** `POST /rebuild/golden`
**What it does:** After you make manual decisions, this recreates the final merged records
**How to use:** Click "Try it out" → "Execute"
**Result:** Updates the golden records with your approved merges

---

### **12. System Information**
📍 **Endpoint:** `GET /info`
**What it does:** Shows technical details about the system
**How to use:** Click "Try it out" → "Execute"
**You'll see:** All available endpoints and system version

---

## 💡 Common Workflows

### **Workflow 1: Process All Data**
1. Go to `/summary` - See current state
2. Go to `/pipeline/run` - Run the cleaning
3. Go to `/records/gold` - See final merged records
4. Done! ✅

### **Workflow 2: Review Questionable Matches**
1. Go to `/review-queue` - See matches needing approval
2. Look at the two records side-by-side
3. Go to `/review/decide` - Say "approve" or "reject"
4. Repeat for each pending match
5. Go to `/rebuild/golden` - Create final records with your decisions

### **Workflow 3: Process Part of Data (For Testing)**
1. Go to `/pipeline/run`
2. Set `produce_limit` to 100 (instead of all)
3. Check results quickly
4. Run full data when satisfied

---

## 📱 Using Without the Visual Interface (Advanced)

If you prefer using command line or Python:

### **Using curl (Command Line)**
```bash
# Check health
curl http://localhost:8000/health

# Get summary
curl http://localhost:8000/summary

# Run pipeline
curl -X POST http://localhost:8000/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"reset_layers": true, "produce_limit": null}'

# Get golden records
curl http://localhost:8000/records/gold?limit=50
```

### **Using Python**
```python
import requests

# Get summary
response = requests.get("http://localhost:8000/summary")
summary = response.json()
print(f"Golden records created: {summary['golden_records']}")

# Run pipeline
response = requests.post("http://localhost:8000/pipeline/run")
result = response.json()
print(result)
```

---

## 🎓 Understanding the Numbers

When you run the pipeline, you'll see:
- **db2_records**: Original messy data
- **bronze_records**: Data received by system
- **silver_records**: Cleaned data
- **duplicate_candidates**: Pairs that look similar
- **auto_merged**: Automatically merged (very confident)
- **manual_review**: Need human decision
- **decided_separate**: Not duplicates
- **golden_records**: Final merged unique customers

---

## ⚙️ Settings You Can Change

In the settings file (`.env`):

```
DB_PATH=./golden_record.db
```
↳ Where the data is stored

```
MOCK_RECORD_COUNT=1200
```
↳ How many demo records to create (change this number for bigger/smaller tests)

```
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```
↳ Where the system gets data from (technical - don't change)

---

## ❓ Frequently Asked Questions

**Q: What does "Golden Record" mean?**
A: One perfect record per person with the best information combined from all their duplicates.

**Q: Can I undo a decision I made?**
A: Yes! Simply run the pipeline again with `reset_layers: true` to start fresh.

**Q: How accurate is the matching?**
A: Very accurate! It uses multiple signals:
- Exact phone number match
- Email address match
- Similar names
- Same date of birth
- Same city

**Q: Can I see how confident the system is?**
A: Yes! Check the confidence score in `/matches` (0-100, higher = more confident)

**Q: What if something goes wrong?**
A: Check that:
1. System is running: `GET /health` should return "healthy"
2. Kafka is running: Check `docker-compose up -d` was successful
3. Try again: Sometimes it just needs a moment to process

**Q: How many records can it handle?**
A: Tested with 1,200 records - takes about 3 seconds. Can handle much larger datasets.

**Q: Is my data safe?**
A: All data stays on your computer in a single file (`golden_record.db`). Nothing goes to the internet.

---

## 🆘 Getting Help

### **If the system won't start:**
```bash
# Make sure Kafka is running
docker-compose up -d

# Check if port 8000 is available
# (try different port if needed)
```

### **If you want to start fresh:**
```bash
# Stop the server (Ctrl+C)
# Delete the database file
rm golden_record.db

# Run pipeline again
# It will automatically create a new database
```

### **If you want more records to test with:**
Edit `.env` and change:
```
MOCK_RECORD_COUNT=5000
```
Then restart the system.

---

## 📝 Summary of Steps

1. ✅ Run `./start_backend.sh`
2. ✅ Open http://localhost:8000/docs
3. ✅ Click `/pipeline/run` → Execute
4. ✅ View results in `/records/gold`
5. ✅ If needed, approve matches in `/review/decide`
6. ✅ Check `/rebuild/golden` to finalize

**That's it! You're deduplicating customer data.** 🎉
