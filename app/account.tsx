import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL, apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

type WorkspaceResponse = {
  success: boolean;
  workspace?: {
    id: string;
    name: string;
    role: string;
  };
  error?: string;
  message?: string;
};

export default function AccountScreen() {
  const { session, workspace, refreshWorkspace, signOut } = useAuth();

  const [workspaceName, setWorkspaceName] = useState(workspace?.name || "");
  const [emailAddress, setEmailAddress] = useState(
    session?.user.email || ""
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCurrentPasswordVisible, setIsCurrentPasswordVisible] =
    useState(false);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);

  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    setWorkspaceName(workspace?.name || "");
  }, [workspace?.name]);

  useEffect(() => {
    setEmailAddress(session?.user.email || "");
  }, [session?.user.email]);

  async function saveWorkspaceName() {
    const cleanedName = workspaceName.trim();

    if (!cleanedName) {
      Alert.alert("Workspace name required", "Enter a workspace name.");
      return;
    }

    if (cleanedName.length > 120) {
      Alert.alert(
        "Workspace name too long",
        "Use 120 characters or fewer."
      );
      return;
    }

    setIsSavingWorkspace(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/api/me/workspace`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: cleanedName }),
      });

      const responseText = await response.text();
      let data: WorkspaceResponse;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "Walkthrough AI received an unexpected response. Please try again."
        );
      }

      if (!response.ok || !data.success || !data.workspace) {
        throw new Error(
          data.error || "Walkthrough AI couldn’t update the workspace."
        );
      }

      await refreshWorkspace();
      setWorkspaceName(data.workspace.name);

      Alert.alert(
        "Workspace updated",
        `${data.workspace.name} is now displayed on your account.`
      );
    } catch (error) {
      Alert.alert(
        "Unable to update workspace",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setIsSavingWorkspace(false);
    }
  }

  async function requestEmailChange() {
    const cleanedEmail = emailAddress.trim().toLowerCase();
    const currentEmail = (session?.user.email || "").trim().toLowerCase();

    if (!cleanedEmail || !cleanedEmail.includes("@")) {
      Alert.alert("Valid email required", "Enter a valid email address.");
      return;
    }

    if (cleanedEmail === currentEmail) {
      Alert.alert(
        "Email unchanged",
        "Enter a different email address before requesting a change."
      );
      return;
    }

    setIsUpdatingEmail(true);

    try {
      const { error } = await supabase.auth.updateUser(
        { email: cleanedEmail },
        { emailRedirectTo: "walkthroughai://auth/callback" }
      );

      if (error) {
        throw error;
      }

      Alert.alert(
        "Check your email",
        "Follow the confirmation instructions sent by WalkthroughAI. Your sign-in email will not change until the required confirmations are completed."
      );
    } catch (error) {
      Alert.alert(
        "Unable to change email",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setIsUpdatingEmail(false);
    }
  }

  async function changePassword() {
    const email = session?.user.email || "";

    if (!email) {
      Alert.alert("Account unavailable", "Your sign-in email could not be loaded.");
      return;
    }

    if (!currentPassword) {
      Alert.alert(
        "Current password required",
        "Enter your current password before choosing a new one."
      );
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert(
        "Password too short",
        "Your new password must contain at least 8 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(
        "Passwords do not match",
        "Re-enter the same new password in both fields."
      );
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert(
        "Choose a new password",
        "Your new password must be different from your current password."
      );
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Your current password is incorrect.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      Alert.alert(
        "Password updated",
        "Your new password is active."
      );
    } catch (error) {
      Alert.alert(
        "Unable to change password",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  function confirmSignOut() {
    Alert.alert(
      "Sign out?",
      "You can sign back in to this workspace at any time.",
      [
        { text: "Stay Signed In", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            signOut().catch((error) => {
              Alert.alert(
                "Unable to sign out",
                error instanceof Error ? error.message : "Please try again."
              );
            });
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>

            <View style={styles.headerText}>
              <Text style={styles.title}>Account</Text>
              <Text style={styles.subtitle}>
                Manage your workspace and sign-in security.
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <Text style={styles.cardLabel}>WORKSPACE</Text>
              <Text style={styles.cardTitle}>Business name</Text>
              <Text style={styles.cardDescription}>
                This name appears at the top of WalkthroughAI for everyone in
                this workspace.
              </Text>

              <TextInput
                autoCapitalize="words"
                maxLength={120}
                onChangeText={setWorkspaceName}
                placeholder="Workspace name"
                placeholderTextColor="#64748B"
                style={styles.input}
                value={workspaceName}
              />

              <Pressable
                accessibilityRole="button"
                disabled={isSavingWorkspace}
                onPress={saveWorkspaceName}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  isSavingWorkspace && styles.buttonDisabled,
                ]}
              >
                {isSavingWorkspace ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Save Workspace Name
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>SIGN-IN EMAIL</Text>
              <Text style={styles.currentValue}>
                Current: {session?.user.email || "Unavailable"}
              </Text>
              <Text style={styles.cardDescription}>
                Changing this email requires confirmation before the new address
                can be used to sign in.
              </Text>

              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmailAddress}
                placeholder="New email address"
                placeholderTextColor="#64748B"
                style={styles.input}
                value={emailAddress}
              />

              <Pressable
                accessibilityRole="button"
                disabled={isUpdatingEmail}
                onPress={requestEmailChange}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                  isUpdatingEmail && styles.buttonDisabled,
                ]}
              >
                {isUpdatingEmail ? (
                  <ActivityIndicator color="#BFDBFE" />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    Request Email Change
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>PASSWORD</Text>
              <Text style={styles.cardTitle}>Change password</Text>
              <Text style={styles.cardDescription}>
                Confirm your current password before setting a new one.
              </Text>

              <PasswordInput
                isVisible={isCurrentPasswordVisible}
                onChangeText={setCurrentPassword}
                onToggleVisibility={() =>
                  setIsCurrentPasswordVisible((current) => !current)
                }
                placeholder="Current password"
                textContentType="password"
                value={currentPassword}
              />

              <PasswordInput
                isVisible={isNewPasswordVisible}
                onChangeText={setNewPassword}
                onToggleVisibility={() =>
                  setIsNewPasswordVisible((current) => !current)
                }
                placeholder="New password"
                textContentType="newPassword"
                value={newPassword}
              />

              <PasswordInput
                isVisible={isConfirmPasswordVisible}
                onChangeText={setConfirmPassword}
                onToggleVisibility={() =>
                  setIsConfirmPasswordVisible((current) => !current)
                }
                placeholder="Confirm new password"
                textContentType="newPassword"
                value={confirmPassword}
              />

              <Pressable
                accessibilityRole="button"
                disabled={isUpdatingPassword}
                onPress={changePassword}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                  isUpdatingPassword && styles.buttonDisabled,
                ]}
              >
                {isUpdatingPassword ? (
                  <ActivityIndicator color="#BFDBFE" />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    Update Password
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>SESSION</Text>
              <Text style={styles.cardDescription}>
                Sign out of WalkthroughAI on this device.
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={confirmSignOut}
                style={({ pressed }) => [
                  styles.signOutButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </Pressable>
            </View>

            <Text style={styles.versionText}>Version 0.1.0</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type PasswordInputProps = {
  isVisible: boolean;
  onChangeText: (value: string) => void;
  onToggleVisibility: () => void;
  placeholder: string;
  textContentType: "password" | "newPassword";
  value: string;
};

function PasswordInput({
  isVisible,
  onChangeText,
  onToggleVisibility,
  placeholder,
  textContentType,
  value,
}: PasswordInputProps) {
  return (
    <View style={styles.passwordInputRow}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        secureTextEntry={!isVisible}
        style={styles.passwordInput}
        textContentType={textContentType}
        value={value}
      />
      <Pressable
        accessibilityLabel={isVisible ? `Hide ${placeholder}` : `Show ${placeholder}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onToggleVisibility}
        style={({ pressed }) => [
          styles.passwordVisibilityButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Ionicons
          color="#94A3B8"
          name={isVisible ? "eye-off-outline" : "eye-outline"}
          size={21}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B1220",
  },

  keyboardView: {
    flex: 1,
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  backButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#17243A",
    borderWidth: 1,
    borderColor: "#31547D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  backButtonText: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "400",
    marginTop: -3,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  scrollContent: {
    paddingBottom: 28,
  },

  card: {
    backgroundColor: "#121C2D",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 16,
    marginBottom: 14,
  },

  cardLabel: {
    color: "#60A5FA",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  cardTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 6,
  },

  currentValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 7,
  },

  cardDescription: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 13,
  },

  input: {
    minHeight: 49,
    borderRadius: 13,
    backgroundColor: "#0C1524",
    borderWidth: 1,
    borderColor: "#26364F",
    color: "#FFFFFF",
    fontSize: 15,
    paddingHorizontal: 14,
    marginBottom: 11,
  },

  passwordInputRow: {
    alignItems: "center",
    backgroundColor: "#0C1524",
    borderColor: "#26364F",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 49,
    marginBottom: 11,
  },

  passwordInput: {
    color: "#FFFFFF",
    flex: 1,
    fontSize: 15,
    minHeight: 47,
    paddingLeft: 14,
    paddingRight: 8,
  },

  passwordVisibilityButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 47,
    paddingHorizontal: 14,
  },

  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  secondaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#172B4D",
    borderWidth: 1,
    borderColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#BFDBFE",
    fontSize: 15,
    fontWeight: "800",
  },

  signOutButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    backgroundColor: "#2B151A",
    alignItems: "center",
    justifyContent: "center",
  },

  signOutButtonText: {
    color: "#FCA5A5",
    fontSize: 15,
    fontWeight: "800",
  },

  versionText: {
    color: "#475569",
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },

  buttonDisabled: {
    opacity: 0.45,
  },
});
