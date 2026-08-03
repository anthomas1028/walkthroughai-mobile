import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../contexts/AuthContext";

function AuthenticatedStack() {
  const { session, isLoading } = useAuth();
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
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#0B1220",
        },
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <AuthenticatedStack />
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
