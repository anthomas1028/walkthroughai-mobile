# Background analysis and completion alerts (prepared, not released)

After the complete photo upload is accepted and its job ID is checkpointed, analysis runs in the existing server worker independently of the iPhone. The upload screen now explains when the user can switch apps, provides Continue in background, pauses foreground polling while inactive, and excludes background time from its polling timeout. Unfinished photo uploads still require the app open; recovery checkpoints support resuming them.

The test variant includes expo-notifications (SDK 54 compatible), a per-job opt-in and turn-off action, and authenticated notification-tap routing to the existing saved job. The OS permission prompt occurs only after the user taps Notify me. Web, Expo Go and ordinary production-profile builds do not enable this feature. The held `testflight` profile explicitly enables it using the existing app bundle ID; backend account allowlisting still applies. The notification plugin changes the native build, so this must not be shipped as an OTA-only update to an older binary.

The backend companion branch must be deployed before enabling the new test build. Set PUSH_TEST_USERS to the explicitly authorized test account IDs on API and worker (leave unset for ordinary customers). The API accepts job-scoped Expo tokens only from the owning user/workspace. Notifications contain a generic message and job ID, with no customer name, images, products or source evidence. Completion/failed events enqueue independent delivery with retries and per-device deduplication. Gateway acceptance is recorded, not represented as confirmed device delivery. EXPO_PUSH_ACCESS_TOKEN is optional if enhanced Expo push security is enabled.

Release remains held. Confirm APNs push credentials for the exact target bundle ID in EAS when building; do not assume credentials exist for a separate .test app. No App Store submission is required for testing. The prepared `testflight` build/submit profiles reuse the existing production bundle ID and ASC app ID. The existing `test` profile remains a separate internal-distribution app; do not use that profile for the existing TestFlight listing.

## Physical-device acceptance

1. Use a TEST-prefixed customer and representative multi-photo upload; keep app open until upload acceptance.
2. Tap Notify me and grant permission, lock the phone or switch apps, then verify the analysis completes and a completion alert arrives.
3. Tap the alert from a locked/cold app and verify sign-in if needed, correct job ownership, and review of the same photo count/results. Do not rerun analysis.
4. Deny permission and verify analysis still completes and Resume walkthrough works; retry after enabling permission in iPhone Settings.
5. Turn off an alert before completion and confirm no new delivery is queued. An already-sent alert can still arrive.
6. Register after completion, repeat registration, and verify no duplicate accepted alert per device/job.
7. Disconnect while uploading, reopen and resume uploaded-photo checkpoints; separately disconnect after upload and verify server analysis continues.
8. Check a failed/partial job, another signed-in account/workspace, and a different active review. Do not expose another account's report or overwrite its draft.

Not guaranteed: background photo upload, continuous JS execution, or immediate push delivery (iOS Focus, permissions and network affect presentation). Real APNs delivery remains unverified until the new build runs on a physical iPhone.
