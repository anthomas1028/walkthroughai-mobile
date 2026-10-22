# Test-app batch: guided label retakes

Implemented on `feature/test-label-retakes`. Not released, not merged to main,
no EAS build/OTA submitted, no server settings changed.

The separate APP_VARIANT=test app exposes the label retake panel; the production
configuration does not. The API additionally requires a server-controlled
LABEL_RETAKES_TEST_USERS allowlist of authenticated user IDs (default empty).
It does not trust app headers or customer names to authorize test access.
Enable the intended test accounts only when preparing the combined test release.

Before first export, edit an item: its valid normalized source box highlights the
label, or the UI explicitly says the location is unavailable. Capture/select a
single close-up. Local source copying and capture advisories precede an explicit
Read action. Only that photo enters the existing resumable upload/job workflow.
Resume reconciles saved slots and the submit response before sending work again.
Compare every candidate; selecting one fills blank fields only. Existing values,
including employee corrections, remain intact. Conflicts require manual editing.
Confirmation is always a separate employee action.

The backend validates ownership, customer, completed single-photo job, original
photo and candidate index. It copies the actual server source image into the
original walkthrough archive and saves server-established extraction/provenance.
History retains this metadata; Excel's Review History sheet includes Close-up
Evidence. The original rack photo and other results are not replaced. Retakes
are limited to before first saved export; this version does not edit saved reports.

Quality checks are conservative advisories for dimensions, edge detail and
exposure. They are not a readability score, do not locate every glare patch,
and cannot certify complete text. No improved OCR accuracy is claimed.

Validation: TypeScript; static Expo test-app web export; conflict/blank application,
geometry and config isolation tests; existing photo-accounting, durable-recovery,
draft, browser-dialog and API-timeout checks; backend test-account, evidence,
customer/owner isolation, path/index validation and workbook/history tests.

Still required in the combined test release: real iPhone camera/Photos permissions,
rotation and highlight alignment, interrupted upload/poll resume, two labels with
conflicting readings, original+retake photo retrieval from saved history, and a
100-photo walkthrough where only one label receives a close-up. Compare employee
review time and identifier errors on unseen manually checked photos.
