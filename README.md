# Receipt Scanner MVP 🧾✨

An experimental receipt-scanning and receipt-database workflow for collecting receipt images, storing metadata, and preparing receipts for OCR/AI-assisted parsing.

This MVP is part of a larger exploration into AI-powered document automation, expense tracking, and property/business record workflows.

---

## 🧠 Project Overview

**Goal:**  
Turn messy, real-world receipt photos into clean, structured data you can use in apps, spreadsheets, or accounting tools.

**Current focus:**

- Mobile receipt upload through an AppSheet-style data-entry interface
- Capturing receipt metadata such as:
  - Receipt image
  - Transaction date
  - Store name
  - Total amount
- OCR extraction of printed text
- First-pass parsing of key fields such as:
  - Merchant / store name
  - Date
  - Total amount (Total / Total Due / Amount Due)
  - Tax and subtotals, if available

---

## ✅ Current MVP Status

**What it can do today:**

- Provide a mobile-friendly receipt entry form
- Allow users to take a receipt photo or choose an existing image
- Save receipt images and metadata into a receipt database workflow
- Run OCR experiments to extract raw text from receipt images
- Do a first-pass parse to:
  - detect a probable **date**
  - detect a probable **total** line, such as “TOTAL” or “AMOUNT DUE”
- Print the extracted fields to the console and/or save as JSON during testing

**Known limitations / bugs from testing:**

- Sometimes misreads the **date**
- Often fails to read **“Total Due”** and its value, especially:
  - when text uses colored backgrounds or yellow fonts
  - when font is very small or low contrast
- Layout-sensitive: cramped thermal receipts are still challenging
- The mobile receipt-entry UI exists, but OCR/parsing automation is still being improved

These limitations are expected at MVP stage and will guide the next iterations.

---

## 📸 Screenshots

### Receipt Database Menu
![Receipt Database Menu](screenshots/app-menu.jpg)

### Receipt Entry Form
![Receipt Entry Form](screenshots/receipt-form.jpg)

### Photo Source Selection
![Photo Source Selection](screenshots/photo-source.jpg)

### Receipt Image Uploaded
![Receipt Image Uploaded](screenshots/receipt-uploaded.jpg)

---

## 🏗️ Architecture (MVP)

High-level flow:

1. **Mobile Receipt Entry**
   - User opens the receipt database form
   - User adds a receipt image by taking a photo or choosing from existing images
   - User may enter or verify transaction date, store name, and total amount

2. **Image Storage**
   - Receipt image is stored for later review and processing
   - Metadata is saved alongside the image

3. **Preprocessing (optional / in progress)**
   - Resize / deskew
   - Grayscale and thresholding
   - Contrast enhancement

4. **OCR Engine**
   - Runs OCR to convert image → raw text

5. **Receipt Parser**
   - Scans lines for:
     - Date patterns, such as `YYYY-MM-DD`, `MM/DD/YYYY`, etc.
     - Keyword patterns: `TOTAL`, `TOTAL DUE`, `AMOUNT DUE`, `CASH`, `CHANGE`, etc.

6. **Output Layer**
   - Structured result as Python dict/JSON, e.g.:

   ```json
   {
     "merchant": "Sample Store",
     "date": "2025-11-23",
     "total": 524.75,
     "currency": "PHP",
     "raw_text": "..."
   }
   ```

---

## 🌱 Larger Use Case

This receipt scanner can become the intake layer for a larger rental billing or business-expense automation system. The mobile app captures receipt images and metadata, while OCR/AI parsing can later help reconcile payments, expenses, and records inside spreadsheets or databases.
