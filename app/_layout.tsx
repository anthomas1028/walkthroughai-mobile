import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RecoveryBanner } from "../components/RecoveryBanner";
import { AlertHost } from "../lib/alerts";
import { AuthProvider, useAuth } from "../contexts/AuthContext";

function AuthenticatedStack() {
  const { session, isLoading, workspaceError, refreshWorkspace } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const isOnSignInScreen = segments[0] === "sign-in";

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!session && !isOnSignInScreen) {
      router.replace("/sign-in");
    } else if (session && isOnSignInScreen) {
      router.replace("/");
    }
  }, [isLoading, router, segments, session]);

  const isRedirecting =
    (!session && !isOnSignInScreen) ||
    Boolean(session && isOnSignInScreen);

  if (isLoading || isRedirecting) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#60A5FA" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}><RecoveryBanner />
    {workspaceError ? <View style={{ backgroundColor: "#442331", padding: 16 }}><Text style={{ color: "white" }}>Workspace unavailable: {workspaceError}</Text><Pressable accessibilityRole="button" onPress={() => refreshWorkspace().catch(() => {})} style={{ paddingVertical: 12 }}><Text style={{ color: "#bfdbfe", fontWeight: "700" }}>Retry connection</Text></Pressable></View> : null}
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#0B1220",
        },
      }}
    /></View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <AuthenticatedStack />
        <AlertHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: "center",
    backgroundColor: "#0B1220",
    flex: 1,
    justifyContent: "center",
  },
});
