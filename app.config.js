const base = require("./app.json").expo;

module.exports = () => {
  const testing = process.env.APP_VARIANT === "test";
  if (!testing) return {
    ...base, version: process.env.APP_STORE_VERSION || base.version,
    ...(process.env.ENABLE_COMPLETION_NOTIFICATIONS === "1" ? {
      plugins: [...base.plugins, "expo-notifications"],
      extra: { ...base.extra, completionNotifications: true },
    } : {}),
  };
  return {
    ...base,
    name: "WalkthroughAI Test",
    scheme: "walkthroughai-test",
    ios: { ...base.ios, bundleIdentifier: `${base.ios.bundleIdentifier}.test` },
    android: { ...base.android, package: `${base.android.package}.test` },
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
