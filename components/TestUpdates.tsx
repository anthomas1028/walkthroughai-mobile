import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Alert } from "../lib/alerts";

export function TestUpdates() {
  const [checking, setChecking] = useState(false);
  if (Constants.expoConfig?.extra?.appVariant !== "test" || Platform.OS === "web") return null;
  async function check() {
    setChecking(true);
    try {
      if (!Updates.isEnabled) throw new Error("Install the internal test build to receive updates.");
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) { Alert.alert("Up to date", "You have the latest compatible test update."); return; }
      await Updates.fetchUpdateAsync();
      Alert.alert("Test update ready", "Finish or save your walkthrough before restarting the app.", [
        { text: "Later", style: "cancel" },
        { text: "Restart now", onPress: () => { void Updates.reloadAsync().catch(() => Alert.alert("Restart needed", "Close and reopen the test app to apply the update.")); } },
      ]);
    } catch (error) { Alert.alert("Update check failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setChecking(false); }
  }
  return <View style={{ backgroundColor: "#342b12", padding: 16, borderRadius: 14, marginBottom: 18 }}>
    <Text style={{ color: "#fde68a", fontWeight: "800" }}>WALKTHROUGHAI TEST</Text>
    <Text style={{ color: "#fef3c7", marginTop: 6 }}>Testing channel · {Updates.updateId ? Updates.updateId.slice(0, 8) : "Installed build"}</Text>
    <Text style={{ color: "#fef3c7", marginTop: 6 }}>Uses the existing backend. Use a dedicated test customer and sample photos.</Text>
    <Pressable accessibilityRole="button" disabled={checking} onPress={check} style={{ minHeight: 48, justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>{checking ? "Checking for updates…" : "Check for test updates"}</Text></Pressable>
  </View>;
}
