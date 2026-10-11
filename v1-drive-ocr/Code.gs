// ============ CONFIG ============

const SPREADSHEET_ID = 'YOUR_SHEET_ID';
const SHEET_NAME      = 'Sheet1';

// process at most this many receipts per trigger run
const MAX_RECEIPTS_PER_RUN = 5;

// column mapping (1-based like in Sheets)
const COL_ID         = 1; // A - ID
const COL_DATE       = 2; // B - Date (from AppSheet)
const COL_IMAGE      = 3; // C - Receipt Image
const COL_TRANS_DATE = 4; // D - Transaction Date (OCR)
const COL_STORE      = 5; // E - Store Name
const COL_TOTAL      = 6; // F - Total Amount
const COL_TAX        = 7; // G - Tax / VAT
const COL_RAWTEXT    = 8; // H - RawText
const COL_UPLOADER   = 9; // I - UploadedBy


// ============ HELPERS ============

// Fix common OCR mistakes you’ve actually seen
function normalizeOcrLine_(line) {
  if (!line) return '';

  let s = line;

  // amount / vat typos
  s = s.replace(/\bAMOUN\b/gi, 'AMOUNT');
  s = s.replace(/\bANOUNT\b/gi, 'AMOUNT');
  s = s.replace(/\bAMOUR\b/gi, 'AMOUNT');   // Amour -> Amount
  s = s.replace(/\bWAT\b/gi, 'VAT');        // WAT -> VAT
  s = s.replace(/\bMAT\b/gi, 'VAT');        // MAT -> VAT
  s = s.replace(/\bTEL EXLE\b/gi, 'TOT EXCL');

  // “Table Sales” / “WiTable” that should be VATable Sales
  s = s.replace(/\bWITable\b/gi, 'VATable');
  s = s.replace(/\bWiTable\b/gi, 'VATable');
  s = s.replace(/\bTable Sales\b/gi, 'VATable Sales');

  // SALES typos
  s = s.replace(/\bSALGS\b/gi, 'SALES');
  s = s.replace(/\bSAF\b/gi, 'SALE');

  return s;
}

// Normalize date string into a JS Date where possible
function normalizeDateString_(raw) {
  if (!raw) return null;
  const cleaned = raw.trim();

  // Pattern like "08 Nov 25"
  const mName = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/);
  if (mName) {
    const d = parseInt(mName[1], 10);
    const monStr = mName[2].toLowerCase();
    const yRaw = parseInt(mName[3], 10);

    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    if (months[monStr] !== undefined) {
      let y = yRaw;
      if (y < 100) y += 2000; // "25" -> 2025
      return new Date(y, months[monStr], d);
    }
  }

  // Fallback: numeric formats (11/05/2025, 2025-11-05)
  const datePart = cleaned.split(/\s+/)[0];
  const parts = datePart.split(/[/-]/);
  if (parts.length !== 3) return cleaned;

  let d, m, y;
  if (parts[0].length === 4) {
    // YYYY-MM-DD
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else {
    // DD/MM/YYYY or MM/DD/YYYY – trust locale
    d = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    y = parseInt(parts[2], 10);
    if (y < 100) y += 2000;
  }

  return new Date(y, m - 1, d);
}

// Uses Advanced Drive Service: "Drive API" must be enabled in Services.
function ocrWithDrive_(fileId) {
  const resource = {
    title: 'temp-ocr-' + new Date().getTime(),
    mimeType: 'application/vnd.google-apps.document'
  };

  // This creates a Google Doc with OCR performed
  const file = Drive.Files.copy(resource, fileId, { ocr: true });
  const docId = file.id;

  try {
    const text = DocumentApp.openById(docId).getBody().getText();
    return text || '';
  } finally {
    // Clean up the temporary doc
    DriveApp.getFileById(docId).setTrashed(true);
  }
}


// ============ MAIN FUNCTION ============

function scanReceiptImages() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet '" + SHEET_NAME + "' not found in spreadsheet " + SPREADSHEET_ID);
  }

  const data = sheet.getDataRange().getValues();
  let processed = 0;

  // helper used inside extraction
  function findNumberNear(lines, lineIndex) {
    for (let k = lineIndex; k < Math.min(lines.length, lineIndex + 3); k++) {
      const nums = lines[k].match(/\d[\d,]*\.\d{2}/g);
      if (nums && nums.length) {
        return nums[nums.length - 1];
      }
    }
    return null;
  }

  // date pattern: 11/05/2025, 2025-11-05, 08 Nov 25
  const dateRegex = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})\b/;

  // Loop over rows (skip header at row 1)
  for (let i = 1; i < data.length; i++) {
    if (processed >= MAX_RECEIPTS_PER_RUN) break;

    const imageFilename  = data[i][COL_IMAGE   - 1]; // C
    const rawTextAlready = data[i][COL_RAWTEXT - 1]; // H

    // Only process rows with an image and no raw text yet
    if (!imageFilename || rawTextAlready) {
      continue;
    }

    try {
      // --- 1. Find file in Drive ---
      const fileNameClean = imageFilename.split('/').pop();
      const files = DriveApp.getFilesByName(fileNameClean);

      if (!files.hasNext()) {
        Logger.log("Row " + (i + 1) + ": No Drive file found for '" + fileNameClean + "'");
        continue;
      }

      const file  = files.next();
      const fileId = file.getId();

      // --- 2. OCR via Drive / Google Doc ---
      const allText = ocrWithDrive_(fileId);
      if (!allText) {
        Logger.log("Row " + (i + 1) + ": OCR returned empty text");
        continue;
      }

      // --- 3. Save raw text ---
      sheet.getRange(i + 1, COL_RAWTEXT).setValue(allText);

      // --- 4. Parse the text ---
      const lines = allText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l)
        .map(normalizeOcrLine_);   // apply OCR fixes here

      // D. STORE NAME – simple version: first non-empty line
      if (lines.length > 0) {
        sheet.getRange(i + 1, COL_STORE).setValue(lines[0]);
      }

      // A. TOTAL AMOUNT (tolerant to “Amour/Amount 864.00”)
      let totalCandidate = null;
      let strongTotal    = null;

      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const distanceFromBottom = lines.length - idx;

        // Skip obvious non-grand-total lines
        if (/VATABLE\s+SALE|VATable\s+Sales|EXEMPT\s+SALE|EXEMPT\s+Sales|ZERO[-\s]*RATED|LESS:\s*VAT|CHANGE/i.test(line)) {
          continue;
        }

        // Highest-priority patterns
        if (/(TOTAL\s+AMOUNT\s+DUE|GRAND\s+TOTAL|TOTAL\s+DUE)/i.test(line)) {
          const n = findNumberNear(lines, idx);
          if (n) {
            strongTotal = n;
            break;
          }
        }

        // Normal priority
        if (/(TOTAL|AMOUNT DUE|AMT DUE|BALANCE DUE|NET\s+AMOUNT)/i.test(line)) {
          const n = findNumberNear(lines, idx);
          if (n) totalCandidate = n;
        }

        // Near the bottom, bare “Amount 864.00”
        if (distanceFromBottom <= 10 && /\bAMOUN[TN]\b/i.test(line) && !/w\/?\s*VAT/i.test(line)) {
          const n = findNumberNear(lines, idx);
          if (n) totalCandidate = n;
        }
      }

      let finalTotal = strongTotal || totalCandidate;

      if (!finalTotal) {
        const nums = allText.match(/\d[\d,]*\.\d{2}/g);
        if (nums && nums.length) {
          finalTotal = nums
            .map(n => parseFloat(n.replace(/,/g, '')))
            .sort((a, b) => b - a)[0]
            .toString();
        }
      }

      if (finalTotal) {
        const cleanPrice = finalTotal.replace(/[^0-9.]/g, '');
        sheet.getRange(i + 1, COL_TOTAL).setValue(cleanPrice);
      }

      // B. TRANSACTION DATE
      let dateCandidate = null;

      for (let idx = 0; idx < lines.length && !dateCandidate; idx++) {
        if (/TR.AS\.?\s*DATE|TRANS\.?\s*DATE|TRX\s*DATE|TRANSACTION\s*DATE/i.test(lines[idx])) {
          let m = lines[idx].match(dateRegex);
          if (!m && idx + 1 < lines.length) {
            m = lines[idx + 1].match(dateRegex);
          }
          if (m) dateCandidate = m[1] || m[0];
        }
      }

      if (!dateCandidate) {
        const m = allText.match(dateRegex);
        if (m) dateCandidate = m[1] || m[0];
      }

      if (dateCandidate) {
        const normalizedDate = normalizeDateString_(dateCandidate);
        sheet.getRange(i + 1, COL_TRANS_DATE).setValue(normalizedDate);
      }

      // C. VAT / TAX
      let vatAmount = null;

      // 1) Prefer an explicit “VAT Amount” line if present
      for (let idx = 0; idx < lines.length; idx++) {
        if (/VAT\s+Amount/i.test(lines[idx])) {
          const n = findNumberNear(lines, idx);
          if (n) {
            vatAmount = n;
            break;
          }
        }
      }

      // 2) Fallback to VATABLE/EXEMPT block
      if (!vatAmount) {
        let vatSale = null;
        let vatStart = -1;
        let vatEnd   = lines.length;

        for (let idx = 0; idx < lines.length; idx++) {
          if (/VATABLE\s+SALE|VATable\s+Sales/i.test(lines[idx])) {
            vatStart = idx;
          }
          if (vatStart !== -1 && /EXEMPT\s+SALE|EXEMPT\s+Sales/i.test(lines[idx])) {
            vatEnd = idx;
            break;
          }
        }

        if (vatStart !== -1) {
          for (let idx = vatStart; idx < vatEnd; idx++) {
            if (vatSale === null) {
              const nums = lines[idx].match(/\d[\d,]*\.\d{2}/g);
              if (nums && nums.length) {
                vatSale = nums[nums.length - 1];
              }
            }
            if (/[VWC]AT/i.test(lines[idx])) {
              const nums = lines[idx].match(/\d[\d,]*\.\d{2}/g);
              if (nums && nums.length) {
                vatAmount = nums[nums.length - 1];
              } else {
                const n = findNumberNear(lines, idx);
                if (n) vatAmount = n;
              }
            }
          }
        }
      }

      if (vatAmount) {
        const cleanVat = vatAmount.replace(/[^0-9.]/g, '');
        sheet.getRange(i + 1, COL_TAX).setValue(cleanVat);
      }

      processed++;

    } catch (e) {
      Logger.log("Row " + (i + 1) + " error: " + e.toString());
    }
  }

  if (processed === 0) {
    Logger.log("scanReceiptImages: No new receipts. Auto-idle 💚");
  } else {
    Logger.log("scanReceiptImages: Processed " + processed + " receipt(s) this run.");
  }
}
