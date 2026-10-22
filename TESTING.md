# WalkthroughAI iPhone testing

The `test` build installs as **WalkthroughAI Test**, alongside the existing app.
It uses `com.andrewthomas.walkthroughai.test`, scheme `walkthroughai-test`,
the existing EAS project, and the `testing` update channel. Fingerprint runtime
versions prevent incompatible native updates from being installed.

## First installation

1. Authenticate this workspace with Expo using `npx --yes eas-cli@25.3.0 login --device`.
2. Confirm access to project `0a00623c-103d-45b8-9540-1508351d3ad1` under `anthomas1028`.
3. Configure the EAS **preview** environment with `APP_VARIANT=test`,
   `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Use the existing project's public authentication settings, never service-role keys.
4. Register the iPhone using EAS device registration and the matching Apple team.
5. Run `npm run test:build:ios`, complete Apple signing if prompted, and install
   the resulting internal-distribution build from its link on the registered iPhone.

## Normal testing

Run `npm run test:update -- "Short description"` to publish compatible iOS changes
to **testing only**. Open Account in WalkthroughAI Test and tap **Check for test updates**.
Save your work before accepting the restart. Native dependency, permission, or
configuration changes require another test build.

Use a dedicated test customer and sample photos. The test app currently points
to the existing Render API and Supabase project; a test channel does not isolate
backend writes. It is not a staging backend. Test emails and records are real.

The existing production build profile and app identity remain unchanged. The
testing helper cannot target the production update channel or submit to Apple.

## Validation

`node scripts/verify-test-config.cjs` verifies identity and channel separation.
`APP_VARIANT=test npx expo export --platform ios --output-dir ../ios-test-export`
validates bundling, but does not validate Apple signing or replace an installed-device test.

## Review and recovery checks
Use a dedicated TEST customer. Capture photos, leave the photo screen, close the app, and verify Restore draft restores photos and locations. After analysis, edit an item, close and resume to check that the open correction draft returns. Local autosaves are debounced; allow one second before closing. Source photos can be zoomed inside the correction screen; Save & Next Flagged Item moves to the next unconfirmed warning. Repeated exact part numbers in the same area are warnings only: verify labels before removing anything. Different locations stay separate.

Photos with a short edge under 700 pixels trigger a resolution warning. This is not an automated blur or lighting detector. Inspect label readability in the photo preview.

## Accuracy baseline
Run `node scripts/evaluate-extraction.cjs labeled-results.json`. Input has an `items` array; each row has a unique `id`, human-labeled `expected` and raw `predicted` objects with `part_number`, `description`, and `package_quantity`. Omit predicted for a missing item; omit expected for an extra detection. Set `corrected: true` when a human corrected the item. Preserve punctuation in part numbers. Use the same fixed sample photos for each run, match detections to labels manually, and record model/version with your dataset. The tool reports exact field matches, missing/extra detections, and correction counts. No measured baseline is claimed until a labeled dataset is supplied.
