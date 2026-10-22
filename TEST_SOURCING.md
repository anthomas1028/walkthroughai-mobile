# Pending test-app batch: Grainger to Fastenal sourcing

Built on the existing `feature/test-label-retakes` branches, alongside guided
retakes. Not merged, deployed, submitted to TestFlight or published through OTA.
No credentials or production settings were changed. Use the existing backend
OpenAI integration; no key belongs in the mobile app.

## Scope and activation for the combined test release

- APP_VARIANT=test exposes `extra.sourcing=true`; production config does not.
- API access additionally requires SOURCING_TEST_USERS to contain the exact
  authenticated test user IDs. Default empty means disabled. Do not substitute
  a client header/customer name for authorization.
- Existing Render worker and queue run `sourcing_lookup.run_lookup`; API and
  worker must both contain this branch's source at release time.
- Existing `ai_processor.client` uses the server's existing OpenAI credential.
  SOURCING_LOOKUP_MODEL defaults to gpt-5.4. Responses web_search access must be
  verified before activation. No live provider test was performed in this build.

## Behavior

From an unsaved review item, enter a Grainger number and tap Find alternatives.
Only that public part number goes to the provider: no customer names, photos,
spreadsheet rows, employee identities or account pricing. Search domains are
restricted to Grainger/Fastenal. Product URLs must be present in returned search
sources and must bind to the stated SKU. No arbitrary URL fetcher is exposed.

The worker returns an exact source item plus at most three candidates. It fails
closed on an unavailable source, malformed provider output, unsupported URLs,
wrong SKU, category mismatch or provider error. No in-code cross-reference table
or hardcoded production answer exists. 29JV88/1024819 appears only in tests.

Comparison is literal and conservative. Same manufacturer/product candidate
requires matching brand + manufacturer model and every category-required
specification, including pack quantity. Otherwise it is a suggested substitute.
Unknown specifications are blank, never matching evidence. Text/unit variations
may appear as differences; the system does not infer engineering equivalence.
All suggestions require employee selection. Differences/missing specs require
acknowledgement, and replacing an existing Fastenal number needs a separate UI
confirmation. Selection sets the Fastenal field but preserves observed,
manufacturer, customer and original supplier numbers and resets item review.
Undo restores the prior Fastenal value.

The selection is authenticated and stored server-side. Finalization validates
its owner, workspace, parent walkthrough, photo, item token and selected SKU.
History preserves source and candidate specifications/URLs, check date,
comparison, employee identity and selection timestamp. The Sourcing Follow-up
Excel sheet separates original supplier/number, selected Fastenal number, match
type, differences/missing specs, links and reviewer metadata. Later manual number
edits mark the historical selection superseded rather than silently endorsing it.

## Bounds and evidence limitations

One active lookup per test account; ten starts per UTC clock hour; eight search
tool calls per provider request; 150-second provider timeout; one-hour public
result cache; 24-hour proposal retention. Upload retries are unrelated to sourcing.
An idempotency token and saved proposal ID allow polling/resume without redoing
an accepted request. Expired queued requests do not start provider research.

Search citations prove the pages were consulted, not that every extracted
attribute is correct. Index coverage may be incomplete. Employee selection is
not a supplier-approved interchange or a suitability guarantee. No account
prices or stock availability are returned. Live costs and accuracy remain
unmeasured; provider usage metadata is retained for support.

## Verification and next device checks

Automated tests cover the glove example as a suggested substitute, rating/pack
conflicts, unknown specs, exact identity rules, unsupported URLs, no source,
provider errors, allowlisting and workspace isolation, idempotent enqueue,
rate/concurrency limits, expired work, employee approval, original identifier
preservation, saved-history/Excel round trip, manual supersession and mobile
resume without automatic assignment. TypeScript and iOS Metro export pass.

Before the combined release: enable only intended test accounts and use a TEST
customer. Verify live lookup for 29JV88, a same-manufacturer item, an unknown SKU,
a pack mismatch, and a safety-spec mismatch. On iPhone check link opening,
difference acknowledgement, existing-number replacement/undo, interrupted
lookup resume, saved-history display and the resulting Excel columns. Do not
claim measured matching accuracy until those sources and selections are checked.

Final automated check: 181 backend tests pass, mobile sourcing/retake/recovery checks pass, TypeScript passes, and the test iOS Metro bundle exports. A lookup with no verified option retains its supplier number as unselected follow-up without assigning a Fastenal SKU. Live provider and real-iPhone checks remain pending the combined test release.

## Manufacturer lookup extension
The test UI defaults to manufacturer + literal manufacturer part number, prefilled from OCR when available. Any manufacturer name is accepted; there is no fixed brand roster. Grainger mode remains available. Manufacturer mode searches public Fastenal pages only and requires the retrieved source listing to contain the same brand and literal MPN. No alias/OEM inference or punctuation stripping. Unknown or unpublished items remain unassigned. This is public search coverage, not an authorized complete catalog feed. Generic-category candidates never claim full specification equivalence. Employee review remains mandatory. Cache and request identities separate manufacturer, mode and literal MPN; history/export retain those fields. No deployment or live provider validation performed for this extension.
