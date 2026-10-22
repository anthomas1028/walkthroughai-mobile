const base = require("./app.json").expo;

module.exports = () => {
  const testing = process.env.APP_VARIANT === "test";
  if (!testing) return { ...base, version: process.env.APP_STORE_VERSION || base.version };
  return {
    ...base,
    name: "WalkthroughAI Test",
    scheme: "walkthroughai-test",
    ios: { ...base.ios, bundleIdentifier: `${base.ios.bundleIdentifier}.test` },
    android: { ...base.android, package: `${base.android.package}.test` },
    runtimeVersion: { policy: "fingerprint" },
    updates: {
      url: `https://u.expo.dev/${base.extra.eas.projectId}`,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    extra: { ...base.extra, appVariant: "test" },
  };
};
