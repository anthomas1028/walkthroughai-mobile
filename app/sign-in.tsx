import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";

export default function SignInScreen() {
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    const cleanedEmail = email.trim().toLowerCase();
    const cleanedWorkspaceName = workspaceName.trim();

    if (!cleanedEmail || !password) {
      Alert.alert("Information required", "Enter your email and password.");
      return;
    }

    if (password.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }

    if (isCreatingAccount && !cleanedWorkspaceName) {
      Alert.alert(
        "Workspace name required",
        "Enter your company or team name. You can change it later."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      if (isCreatingAccount) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanedEmail,
          password,
          options: {
            data: {
              workspace_name: cleanedWorkspaceName,
            },
          },
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          Alert.alert(
            "Check your email",
            "Open the confirmation email from Walkthrough AI, then return here and sign in."
          );
          setIsCreatingAccount(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanedEmail,
          password,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      Alert.alert(
        isCreatingAccount ? "Unable to create account" : "Unable to sign in",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={require("../assets/images/icon.png")}
            style={styles.logo}
          />

          <Text style={styles.title}>Walkthrough AI</Text>
          <Text style={styles.subtitle}>
            {isCreatingAccount
              ? "Create your private company workspace."
              : "Sign in to your customer walkthroughs."}
          </Text>

          <View style={styles.card}>
            {isCreatingAccount ? (
              <TextInput
                autoCapitalize="words"
                onChangeText={setWorkspaceName}
                placeholder="Company or workspace name"
                placeholderTextColor="#64748B"
                style={styles.input}
                value={workspaceName}
              />
            ) : null}

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#64748B"
              style={styles.input}
              value={email}
            />

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              placeholder="Password"
              placeholderTextColor="#64748B"
              secureTextEntry
              style={styles.input}
              value={password}
            />

            <Pressable
              disabled={isSubmitting}
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                isSubmitting && styles.disabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isCreatingAccount ? "Create Workspace" : "Sign In"}
                </Text>
              )}
            </Pressable>

            <Pressable
              disabled={isSubmitting}
              onPress={() => setIsCreatingAccount((current) => !current)}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {isCreatingAccount
                  ? "Already have an account? Sign in"
                  : "New to Walkthrough AI? Create account"}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.privacyText}>
            Each workspace has its own customers, walkthroughs, photos, and reports.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#07111F" },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  logo: {
    width: 92,
    height: 92,
    borderRadius: 24,
    alignSelf: "center",
    marginBottom: 24,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 17,
    lineHeight: 25,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 28,
  },
  card: {
    backgroundColor: "#101D31",
    borderColor: "#29415F",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  input: {
    backgroundColor: "#0B1628",
    borderColor: "#334E70",
    borderRadius: 14,
    borderWidth: 1,
    color: "#FFFFFF",
    fontSize: 17,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2F6FEB",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 58,
    marginTop: 4,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  secondaryButton: { alignItems: "center", paddingHorizontal: 8, paddingVertical: 12 },
  secondaryButtonText: { color: "#83B9FF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  privacyText: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 22,
    textAlign: "center",
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
