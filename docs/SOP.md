# SOP — Receipt Scanner (AppSheet + Apps Script)

**Status:** Draft for production validation. **Current deployed version:** v1 Drive OCR. **Candidate upgrade:** v2 Gemini vision (still in testing). Owner: project maintainer. Review on every deployment and monthly thereafter.

## Purpose and scope
Convert receipt images submitted through AppSheet into expense fields in Google Sheets. AI/OCR extraction is **not** final accounting approval; a human must verify monetary fields before posting to books.

## Preconditions and access
- Authorized AppSheet access, Google Drive folder and Google Sheet with the columns listed in README.
- Apps Script access and correctly scoped trigger permissions.
- For v2 only: active Gemini API key stored in **Script Properties** (never committed).
- Defined receipt retention policy, staff permissions and a secured sheet; receipt photos may contain personal/financial information.

## Normal operating steps
1. Operator uploads a legible receipt via the AppSheet form and confirms a new Sheet row and image appear.
2. Wait for the scheduled `scanReceiptImages()` execution (v2) or run it manually if testing. The script handles at most five receipts per invocation.
3. Verify that Store Name, Transaction Date, Total Amount, Tax/VAT and RawText are populated as expected.
4. Compare **date, total, currency and VAT** with the original image. Correct mistakes and log the correction. Never silently treat AI output as authoritative.
5. Mark the transaction approved only through a separate human verification process. No approval column/workflow has been verified in this repository.

## Monitoring (each workday)
- Count unprocessed receipt rows and rows with missing/invalid fields.
- Inspect Apps Script execution failures, trigger health, quotas and API costs.
- Ensure processing is not stuck, and that the same image/receipt has not been processed twice.

## Common failures and recovery
| Symptom | Check | Recovery |
|---|---|---|
| Image row never processed | Trigger history, permissions, image link and `RawText` status | Fix trigger/permissions; rerun a **single test**; verify resulting row |
| Wrong image matched | Duplicate Drive filenames (known v2 limitation) | Stop batch processing; manually verify and correct affected rows; migrate to Drive file-ID matching before v2 promotion |
| Missing/wrong totals | Poor photo, model extraction, schema | Re-image or manually correct; flag for review; do not export to accounting automatically |
| Gemini call fails | Script Properties key, quotas, model retirement, API logs | Rotate/reconfigure key in secret storage; test one receipt; retry only after root cause is fixed |
| Duplicate rows | AppSheet submission history and sheet IDs | Quarantine duplicates and reconcile with originals |

## Change / release procedure
1. Back up a **redacted** copy of the schema/config and export authorized data securely; never put live receipts in public GitHub issues.
2. Test change against anonymized receipts (clear, blurry, multiple VAT formats, duplicate filenames, empty images).
3. Compare v2 against deployed v1 using a labeled evaluation set; record totals/date/VAT accuracy and failure rates.
4. Verify file-ID linkage, manual review mechanism, error logging and recoverability before changing the deployed trigger.
5. Deploy to a test Sheet first; then roll out to production in a limited batch. Monitor and keep a tested v1 rollback path.

## Production acceptance — all must be evidenced
- [ ] Verify actual deployment, operator access and trigger health.
- [ ] Prevent duplicate/wrong-image matching; prefer immutable Drive file IDs.
- [ ] Implement explicit statuses (queued/processed/needs review/approved/failed) and safe retries.
- [ ] Run a documented labeled accuracy test; set business-approved accuracy thresholds.
- [ ] Verify privacy permissions, retention, secret handling and deletion procedure.
- [ ] Test alerting, logging, recovery and a rollback.
- [ ] Record runbook owner, last test date, and evidence links.

**Do not claim v2 production-ready until these checks pass.**
