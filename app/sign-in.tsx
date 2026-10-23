import { UI } from "../constants/design";
import { Alert } from "../lib/alerts";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoLinking from "expo-linking";
import { useState } from "react";
import {
  ActivityIndicator,

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
  const [notice, setNotice] = useState("");
  function notify(title: string, message: string) {
    setNotice(`${title}: ${message}`);
    if (Platform.OS !== "web") Alert.alert(title, message);
  }
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setNotice("");
    const cleanedEmail = email.trim().toLowerCase();
    const cleanedWorkspaceName = workspaceName.trim();

    if (!cleanedEmail || !password) {
      notify("Information required", "Enter your email and password.");
      return;
    }

    if (password.length < 8) {
      notify("Password too short", "Use at least 8 characters.");
      return;
    }

    if (isCreatingAccount && !cleanedWorkspaceName) {
      notify(
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
            emailRedirectTo: ExpoLinking.createURL("/"),
          },
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          notify(
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
      notify(
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
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
              ? "Create an account to begin your first walkthrough."
              : "Sign in to begin a walkthrough or review previous walkthroughs."}
          </Text>

          <View style={styles.card}>
            {notice ? <Text accessibilityRole="alert" style={{ color: "#BFDBFE", marginBottom: 12 }}>{notice}</Text> : null}
            {isCreatingAccount ? (
              <View><Text style={{ color: "#b8c8db", fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Company or workspace name</Text><TextInput accessibilityLabel="Company or workspace name"
                autoCapitalize="words"
                onChangeText={setWorkspaceName}
                placeholder="Company or workspace name"
                placeholderTextColor="#94A8C0"
                style={styles.input}
                value={workspaceName}
              /></View>
            ) : null}

            <View><Text style={{ color: "#b8c8db", fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Email address</Text><TextInput accessibilityLabel="Email address"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#94A8C0"
              style={styles.input}
              value={email}
            /></View>

            <View style={styles.passwordInputRow}>
              <TextInput accessibilityLabel="Password"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPassword}
                onSubmitEditing={submit}
                placeholder="Password"
                placeholderTextColor="#94A8C0"
                secureTextEntry={!isPasswordVisible}
                style={styles.passwordInput}
                value={password}
              />
              <Pressable
                accessibilityLabel={
                  isPasswordVisible ? "Hide password" : "Show password"
                }
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setIsPasswordVisible((current) => !current)}
                style={({ pressed }) => [
                  styles.passwordVisibilityButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  color="#94A3B8"
                  name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                  size={22}
                />
              </Pressable>
            </View>

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
                  : "New here? Create an account"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.differenceSection}>
            <Text style={styles.differenceTitle}>
              Capture. Review. Report.
            </Text>
          </View>
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
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 19,
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {flexShrink: 1,
    color: "#FFFFFF",
    fontSize: UI.pageTitle,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  card: {
    backgroundColor: "#101D31",
    borderColor: "#29415F",
    borderRadius: UI.cardRadius,
    borderWidth: 1,
    padding: UI.cardPadding,
    gap: 10,
  },
  input: { minWidth: 0,
    backgroundColor: "#0B1628",
    borderColor: "#334E70",
    borderRadius: 14,
    borderWidth: 1,
    color: "#FFFFFF",
    fontSize: 17,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  passwordInputRow: {
    alignItems: "center",
    backgroundColor: "#0B1628",
    borderColor: "#334E70",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 50,
  },
  passwordInput: {
    minWidth: 0,
    color: "#FFFFFF",
    flex: 1,
    fontSize: 17,
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 8,
  },
  passwordVisibilityButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2F6FEB",
    borderRadius: UI.cardRadius,
    justifyContent: "center",
    minHeight: UI.controlHeight,
    marginTop: 2,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondaryButton: {minHeight: 44,  alignItems: "center", paddingHorizontal: 8, paddingVertical: 8 },
  secondaryButtonText: { color: "#83B9FF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  differenceSection: {
    marginTop: 16,
    paddingHorizontal: 12,
  },
  differenceTitle: {
    color: "#A7CFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
