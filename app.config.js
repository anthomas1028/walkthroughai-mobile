const base = require("./app.json").expo;

module.exports = () => {
  const testflight = process.env.APP_VARIANT === "testflight";
  const testing = process.env.APP_VARIANT === "test" || testflight;
  if (!testing) return {
    ...base, version: process.env.APP_STORE_VERSION || base.version,
    ...(process.env.ENABLE_COMPLETION_NOTIFICATIONS === "1" ? {
      plugins: [...base.plugins, "expo-notifications"],
      extra: { ...base.extra, completionNotifications: true },
    } : {}),
  };
  return {
    ...base,
    name: testflight ? base.name : "WalkthroughAI Test",
    version: testflight ? process.env.APP_STORE_VERSION || base.version : base.version,
    scheme: testflight ? base.scheme : "walkthroughai-test",
    ios: testflight ? base.ios : { ...base.ios, bundleIdentifier: `${base.ios.bundleIdentifier}.test` },
    android: testflight ? base.android : { ...base.android, package: `${base.android.package}.test` },
    plugins: [...base.plugins, "expo-notifications"],
    runtimeVersion: { policy: "fingerprint" },
    updates: {
      url: `https://u.expo.dev/${base.extra.eas.projectId}`,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    extra: { ...base.extra, appVariant: "test", labelRetakes: true, sourcing: true, completionNotifications: true },
  };
};
