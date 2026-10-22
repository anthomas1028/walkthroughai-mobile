import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { Alert } from "../lib/alerts";
export function ResumeWalkthrough() {
  const { session } = useAuth();
  const [job, setJob] = useState<any>(null);
  const key = `active-walkthrough:${session?.user.id || ""}`;
  useFocusEffect(useCallback(() => {
    let active = true;
    if (session) AsyncStorage.getItem(key).then(value => { if (active) { try { setJob(value ? JSON.parse(value) : null); } catch { setJob(null); } } }).catch(() => {});
    return () => { active = false; };
  }, [key, session?.user.id]));
  if (!job) return null;
  const expired = Date.now() - job.startedAt > 24 * 60 * 60 * 1000;
  return <View style={{ padding: 16, backgroundColor: "#142a45", borderRadius: 16, marginBottom: 16 }}>
    <Text style={{ color: "white", fontWeight: "700", fontSize: 17 }}>{expired ? "Older walkthrough" : "Continue your walkthrough"}</Text>
    <Text style={{ color: "#bfdbfe", marginTop: 6 }}>{job.customerName || "Your customer"}{expired ? " — the temporary analysis may have expired. Check History for saved reports." : " — reopen analysis or your unfinished review."}</Text>
    {!expired ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/upload", params: { resumeJobId: job.jobId, savedDraft: "true", customerId: job.customerId, customerName: job.customerName } })} style={{ minHeight: 48, justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Resume walkthrough →</Text></Pressable> : null}
    <Pressable accessibilityRole="button" onPress={() => Alert.alert("Dismiss recovery?", "This removes the recovery shortcut from this browser. Saved reports are kept in History.", [{ text: "Keep", style: "cancel" }, { text: "Dismiss", onPress: () => { void AsyncStorage.multiRemove([key, `${key}:review`]); setJob(null); } }])} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#9eb3cc" }}>Dismiss recovery</Text></Pressable>
  </View>;
}
