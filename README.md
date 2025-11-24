# Receipt Scanner MVP 🧾✨

An experimental receipt-scanning tool that uses OCR and an AI-assisted parsing pipeline
to extract structured data (date, merchant, line items, totals) from real-world receipts.

This MVP is part of a larger exploration into AI-powered document automation and
expense workflows.

---

## 🧠 Project Overview

**Goal:**  
Turn messy, real-world receipt photos into clean, structured data you can use in apps,
spreadsheets, or accounting tools.

**Current focus:**

- Single-receipt images (phone photos)
- OCR extraction of printed text
- Parsing of key fields such as:
  - Merchant / store name
  - Date
  - Total amount (Total / Total Due / Amount Due)
  - Tax and subtotals (if available)

---

## ✅ Current MVP Status

**What it can do _today_:**

- Load an image of a receipt (PNG/JPEG).
- Run OCR to extract raw text.
- Do a first-pass parse to:
  - detect a probable **date**
  - detect a probable **total** line (e.g., containing “TOTAL” or “AMOUNT DUE”)
- Print the extracted fields to the console and/or save as JSON.

**Known limitations / bugs (from testing):**

- Sometimes misreads the **date**.
- Often fails to read **“Total Due”** and its value, especially:
  - when text uses **colored backgrounds** or **yellow fonts**
  - when font is very small or low contrast
- Layout-sensitive: cramped thermal receipts are still challenging.
- No UI yet – everything runs from a script/terminal.

These limitations are expected at MVP stage and will guide the next iterations.

---

## 🏗️ Architecture (MVP)

High-level flow:

1. **Image Input**
   - User supplies a receipt image file path.
2. **Preprocessing (optional / in progress)**
   - Resize / deskew
   - Grayscale, thresholding
   - Contrast enhancement
3. **OCR Engine**
   - Runs OCR to convert image → raw text.
4. **Receipt Parser**
   - Scans lines for:
     - Date patterns (e.g., `YYYY-MM-DD`, `MM/DD/YYYY`, etc.)
     - Keyword patterns: `"TOTAL"`, `"TOTAL DUE"`, `"AMOUNT DUE"`, `"CASH"`, `"CHANGE"`, etc.
5. **Output Layer**
   - Structured result (Python dict/JSON), e.g.:

   ```json
   {
     "merchant": "Sample Store",
     "date": "2025-11-23",
     "total": 524.75,
     "currency": "PHP",
     "raw_text": "..."
   }

