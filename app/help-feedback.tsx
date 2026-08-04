import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
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

type FeedbackType = "bug" | "suggestion" | "help";

type FeedbackOption = {
  id: FeedbackType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const feedbackOptions: FeedbackOption[] = [
  {
    id: "bug",
    title: "Report a Bug",
    description: "Tell us what went wrong and what you expected.",
    icon: "bug-outline",
  },
  {
    id: "suggestion",
    title: "Suggest an Improvement",
    description: "Share an idea that would make WalkthroughAI better.",
    icon: "bulb-outline",
  },
  {
    id: "help",
    title: "Ask for Help",
    description: "Get help with your account or a walkthrough.",
    icon: "help-circle-outline",
  },
];

export default function HelpFeedbackScreen() {
  const { session, workspace } = useAuth();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const selectedOption = useMemo(
    () => feedbackOptions.find((option) => option.id === feedbackType),
    [feedbackType]
  );

  async function sendFeedback() {
    const cleanedMessage = message.trim();

    if (!cleanedMessage) {
      Alert.alert(
        "Message required",
        "Tell us what happened, what you need help with, or what you would like improved."
      );
      return;
    }

    setIsSending(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: feedbackType,
          message: cleanedMessage,
          app_version: "2.0.0",
          platform: Platform.OS,
        }),
      });

      const responseText = await response.text();
      let data: {
        success: boolean;
        message?: string;
        error?: string;
      };

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "WalkthroughAI received an unexpected response. Please try again."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "WalkthroughAI could not send your feedback."
        );
      }

      setMessage("");

      Alert.alert(
        "Feedback sent",
        "Thank you. Your message was sent directly to WalkthroughAI support.",
        [
          {
            text: "Done",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        "Unable to send feedback",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setIsSending(false);
    }
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
              <Text style={styles.title}>Help & Feedback</Text>
              <Text style={styles.subtitle}>
                Report a problem, share an idea, or ask for help.
              </Text>
            </View>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>WHAT DO YOU NEED?</Text>

            {feedbackOptions.map((option) => {
              const isSelected = feedbackType === option.id;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={option.id}
                  onPress={() => setFeedbackType(option.id)}
                  style={({ pressed }) => [
                    styles.optionCard,
                    isSelected && styles.optionCardSelected,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.optionIcon,
                      isSelected && styles.optionIconSelected,
                    ]}
                  >
                    <Ionicons
                      color={isSelected ? "#FFFFFF" : "#93C5FD"}
                      name={option.icon}
                      size={22}
                    />
                  </View>

                  <View style={styles.optionTextArea}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionDescription}>
                      {option.description}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.radioOuter,
                      isSelected && styles.radioOuterSelected,
                    ]}
                  >
                    {isSelected ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            })}

            <View style={styles.messageCard}>
              <Text style={styles.cardLabel}>YOUR MESSAGE</Text>
              <Text style={styles.cardTitle}>
                {selectedOption?.title || "Feedback"}
              </Text>
              <Text style={styles.cardDescription}>
                Include what you were doing, what happened, and what you expected.
              </Text>

              <TextInput
                multiline
                onChangeText={setMessage}
                placeholder="Type your message here..."
                placeholderTextColor="#64748B"
                scrollEnabled
                style={styles.messageInput}
                textAlignVertical="top"
                value={message}
              />

              <Pressable
                accessibilityRole="button"
                disabled={isSending}
                onPress={sendFeedback}
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.buttonPressed,
                  isSending && styles.buttonDisabled,
                ]}
              >
                {isSending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons color="#FFFFFF" name="send-outline" size={20} />
                    <Text style={styles.sendButtonText}>Send Feedback</Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.emailNote}>
                Your message will be sent directly to WalkthroughAI support.
              </Text>
            </View>

            <View style={styles.detailsCard}>
              <Ionicons
                color="#60A5FA"
                name="information-circle-outline"
                size={21}
              />
              <Text style={styles.detailsText}>
                Your account, workspace, app version, and device platform will be
                added automatically so we can help faster.
              </Text>
            </View>

            <Text style={styles.versionText}>Version 2.0.0</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    paddingBottom: 36,
  },

  sectionLabel: {
    color: "#60A5FA",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  optionCard: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#121C2D",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 14,
    marginBottom: 10,
  },

  optionCardSelected: {
    backgroundColor: "#14243A",
    borderColor: "#3B82F6",
  },

  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#172B4D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  optionIconSelected: {
    backgroundColor: "#2563EB",
  },

  optionTextArea: {
    flex: 1,
    paddingRight: 10,
  },

  optionTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  optionDescription: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },

  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#64748B",
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: "#3B82F6",
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3B82F6",
  },

  messageCard: {
    backgroundColor: "#121C2D",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 16,
    marginTop: 8,
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
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },

  cardDescription: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 13,
  },

  messageInput: {
    minHeight: 150,
    borderRadius: 14,
    backgroundColor: "#0C1524",
    borderWidth: 1,
    borderColor: "#26364F",
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 13,
  },

  sendButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 13,
    gap: 8,
  },

  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  emailNote: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 10,
  },

  detailsCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#101A2A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 14,
    marginTop: 14,
  },

  detailsText: {
    color: "#94A3B8",
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 9,
  },

  versionText: {
    color: "#52647A",
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});
