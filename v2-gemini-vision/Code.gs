// ============ CONFIG ============

const SPREADSHEET_ID = 'YOUR_SHEET_ID';
const SHEET_NAME      = 'Sheet1';

// process at most this many receipts per trigger run
const MAX_RECEIPTS_PER_RUN = 5;

// Gemini model to use
const GEMINI_MODEL = 'gemini-2.0-flash';

// column mapping (1-based like in Sheets)
const COL_ID         = 1; // A - ID
const COL_DATE       = 2; // B - Date (from AppSheet)
const COL_IMAGE      = 3; // C - Receipt Image
const COL_TRANS_DATE = 4; // D - Transaction Date (from AI)
const COL_STORE      = 5; // E - Store Name
const COL_TOTAL      = 6; // F - Total Amount
const COL_TAX        = 7; // G - Tax / VAT
const COL_RAWTEXT    = 8; // H - RawText (now: raw Gemini JSON response, for debugging)
const COL_UPLOADER   = 9; // I - UploadedBy


// ============ HELPERS ============

// Get the Gemini API key from Script Properties (set this once via
// Project Settings > Script Properties, key = "GEMINI_API_KEY")
function getGeminiApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error('Missing GEMINI_API_KEY in Script Properties. Set it under Project Settings.');
  }
  return key;
}

// Sends the receipt image to Gemini Flash and asks for structured fields back.
// Returns a parsed object: { store, total, transactionDate, vat } or null on failure.
function extractReceiptWithGemini_(fileBlob) {
  const apiKey = getGeminiApiKey_();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
              GEMINI_MODEL + ':generateContent?key=' + apiKey;

  const base64Image = Utilities.base64Encode(fileBlob.getBytes());
  const mimeType = fileBlob.getContentType() || 'image/jpeg';

  const prompt =
    'You are reading a retail/store receipt image. Extract the following fields ' +
    'and return ONLY a valid JSON object, no markdown fences, no extra text:\n' +
    '{\n' +
    '  "store": string (store/business name as printed, or null if unreadable),\n' +
    '  "total": string (grand total amount, numbers only e.g. "864.00", or null),\n' +
    '  "transactionDate": string (date in YYYY-MM-DD format if determinable, or null),\n' +
    '  "vat": string (VAT/tax amount, numbers only, or null if not shown),\n' +
    '  "confidence": string ("high", "medium", or "low" - your confidence in this extraction)\n' +
    '}\n' +
    'If a field is not visible or you are unsure, use null rather than guessing.';

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Image
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json'
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const bodyText = response.getContentText();

  if (code !== 200) {
    Logger.log('Gemini API error ' + code + ': ' + bodyText);
    return null;
  }

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(bodyText);
  } catch (e) {
    Logger.log('Failed to parse Gemini response envelope: ' + e);
    return null;
  }

  const candidate = parsedResponse.candidates && parsedResponse.candidates[0];
  const textPart = candidate && candidate.content && candidate.content.parts &&
                    candidate.content.parts[0] && candidate.content.parts[0].text;

  if (!textPart) {
    Logger.log('No text content in Gemini response: ' + bodyText);
    return null;
  }

  let fields;
  try {
    fields = JSON.parse(textPart);
  } catch (e) {
    Logger.log('Failed to parse Gemini extracted fields JSON: ' + textPart);
    return null;
  }

  // keep the raw model text alongside for debugging in the sheet
  fields._rawModelText = textPart;
  return fields;
}

// Normalize date string (Gemini is asked for YYYY-MM-DD, but be defensive)
function normalizeDateString_(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();

  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  }

  // Fallback: let JS try to parse it directly
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
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

  for (let i = 1; i < data.length; i++) {
    if (processed >= MAX_RECEIPTS_PER_RUN) break;

    const imageFilename  = data[i][COL_IMAGE   - 1]; // C
    const rawTextAlready = data[i][COL_RAWTEXT - 1]; // H

    // Only process rows with an image and no raw text yet (same dedup as before)
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

      const file = files.next();
      const blob = file.getBlob();

      // --- 2. Extract fields via Gemini vision ---
      const fields = extractReceiptWithGemini_(blob);

      if (!fields) {
        Logger.log("Row " + (i + 1) + ": Gemini extraction failed, skipping this run (will retry next run since RawText stays empty)");
        continue;
      }

      // --- 3. Save raw model response (debug trail, same purpose as old RawText) ---
      sheet.getRange(i + 1, COL_RAWTEXT).setValue(fields._rawModelText || JSON.stringify(fields));

      // --- 4. Write extracted fields ---
      if (fields.store) {
        sheet.getRange(i + 1, COL_STORE).setValue(fields.store);
      }

      if (fields.total) {
        const cleanTotal = String(fields.total).replace(/[^0-9.]/g, '');
        sheet.getRange(i + 1, COL_TOTAL).setValue(cleanTotal);
      }

      if (fields.transactionDate) {
        const normalizedDate = normalizeDateString_(fields.transactionDate);
        if (normalizedDate) {
          sheet.getRange(i + 1, COL_TRANS_DATE).setValue(normalizedDate);
        }
      }

      if (fields.vat) {
        const cleanVat = String(fields.vat).replace(/[^0-9.]/g, '');
        sheet.getRange(i + 1, COL_TAX).setValue(cleanVat);
      }

      // Optional: flag low-confidence rows for manual review.
      // Requires a "Needs Review" column - add one if you want this active.
      // if (fields.confidence === 'low') {
      //   sheet.getRange(i + 1, COL_NEEDS_REVIEW).setValue('Needs Review');
      // }

      processed++;

    } catch (e) {
      Logger.log("Row " + (i + 1) + " error: " + e.toString());
    }
  }

  if (processed === 0) {
    Logger.log("scanReceiptImages: No new receipts. Auto-idle 💚");
  } else {
    Logger.log("scanReceiptImages: Processed " + processed + " receipt(s) this run via Gemini vision.");
  }
}