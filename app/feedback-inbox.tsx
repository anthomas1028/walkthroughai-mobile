import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_BASE_URL, apiFetch } from "../lib/api";

type FeedbackRecord = {
  id: number;
  user_id?: string | null;
  organization_id?: string | null;
  account_email?: string | null;
  workspace_name?: string | null;
  feedback_type: "bug" | "suggestion" | "help" | string;
  feedback_title: string;
  message: string;
  app_version?: string | null;
  platform?: string | null;
  delivery_status: "saved" | "emailed" | "email_failed" | string;
  recipient_email?: string | null;
  email_id?: string | null;
  email_error?: string | null;
  created_at: string;
  updated_at: string;
};

type FeedbackInboxResponse = {
  success: boolean;
  feedback?: FeedbackRecord[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
};

type FilterValue = "all" | "bug" | "suggestion" | "help";

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Bugs", value: "bug" },
  { label: "Suggestions", value: "suggestion" },
  { label: "Help", value: "help" },
];

export default function FeedbackInboxScreen() {
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>("all");
  const [searchText, setSearchText] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const loadFeedback = useCallback(
    async (refreshing = false) => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const query = new URLSearchParams({
          limit: "100",
          offset: "0",
        });

        if (selectedFilter !== "all") {
          query.set("type", selectedFilter);
        }

        if (submittedSearch.trim()) {
          query.set("search", submittedSearch.trim());
        }

        const response = await apiFetch(
          `${API_BASE_URL}/api/admin/feedback?${query.toString()}`
        );

        const responseText = await response.text();
        let data: FeedbackInboxResponse;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            "WalkthroughAI received an unexpected response from the feedback inbox."
          );
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "WalkthroughAI could not load the feedback inbox."
          );
        }

        setRecords(data.feedback || []);
        setTotal(data.total || 0);
      } catch (error) {
        Alert.alert(
          "Unable to load feedback",
          error instanceof Error ? error.message : "Please try again."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedFilter, submittedSearch]
  );

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const summary = useMemo(() => {
    const emailed = records.filter(
      (record) => record.delivery_status === "emailed"
    ).length;
    const failed = records.filter(
      (record) => record.delivery_status === "email_failed"
    ).length;
    const saved = records.filter(
      (record) => record.delivery_status === "saved"
    ).length;

    return { emailed, failed, saved };
  }, [records]);

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function submitSearch() {
    setSubmittedSearch(searchText.trim());
  }

  function clearSearch() {
    setSearchText("");
    setSubmittedSearch("");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
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
            <Text style={styles.title}>Feedback Inbox</Text>
            <Text style={styles.subtitle}>
              View saved support messages and email delivery status.
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              onRefresh={() => loadFeedback(true)}
              refreshing={isRefreshing}
              tintColor="#60A5FA"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryRow}>
            <SummaryCard label="TOTAL" value={total} color="#60A5FA" />
            <SummaryCard
              label="EMAILED"
              value={summary.emailed}
              color="#34D399"
            />
            <SummaryCard
              label="FAILED"
              value={summary.failed}
              color="#F87171"
            />
          </View>

          <View style={styles.searchCard}>
            <View style={styles.searchRow}>
              <Ionicons color="#64748B" name="search-outline" size={20} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSearchText}
                onSubmitEditing={submitSearch}
                placeholder="Search email, workspace, or message"
                placeholderTextColor="#64748B"
                returnKeyType="search"
                style={styles.searchInput}
                value={searchText}
              />
              {searchText ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={clearSearch}
                >
                  <Ionicons color="#94A3B8" name="close-circle" size={20} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={submitSearch}
              style={({ pressed }) => [
                styles.searchButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.searchButtonText}>Search</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.filterRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {FILTERS.map((filter) => {
              const selected = selectedFilter === filter.value;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={filter.value}
                  onPress={() => setSelectedFilter(filter.value)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    selected && styles.filterChipSelected,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selected && styles.filterChipTextSelected,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#60A5FA" size="large" />
              <Text style={styles.loadingText}>Loading feedback…</Text>
            </View>
          ) : records.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                color="#64748B"
                name="mail-open-outline"
                size={42}
              />
              <Text style={styles.emptyTitle}>No feedback found</Text>
              <Text style={styles.emptyText}>
                Try another filter or search term.
              </Text>
            </View>
          ) : (
            records.map((record) => {
              const isExpanded = expandedIds.has(record.id);

              return (
                <FeedbackCard
                  isExpanded={isExpanded}
                  key={record.id}
                  onToggle={() => toggleExpanded(record.id)}
                  record={record}
                />
              );
            })
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function SummaryCard({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function FeedbackCard({
  isExpanded,
  onToggle,
  record,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  record: FeedbackRecord;
}) {
  const category = getCategoryDetails(record.feedback_type);
  const delivery = getDeliveryDetails(record.delivery_status);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onToggle}
      style={({ pressed }) => [
        styles.feedbackCard,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={[styles.categoryIcon, { backgroundColor: category.background }]}>
          <Ionicons color={category.color} name={category.icon} size={20} />
        </View>

        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{record.feedback_title}</Text>
          <Text style={styles.cardMeta}>
            {formatDate(record.created_at)} · #{record.id}
          </Text>
        </View>

        <Ionicons
          color="#64748B"
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={20}
        />
      </View>

      <Text numberOfLines={isExpanded ? undefined : 3} style={styles.message}>
        {record.message}
      </Text>

      <View style={styles.badgeRow}>
        <View style={[styles.statusBadge, { backgroundColor: delivery.background }]}>
          <View style={[styles.statusDot, { backgroundColor: delivery.color }]} />
          <Text style={[styles.statusText, { color: delivery.color }]}>
            {delivery.label}
          </Text>
        </View>

        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{category.label}</Text>
        </View>
      </View>

      {isExpanded ? (
        <View style={styles.details}>
          <DetailRow label="Account" value={record.account_email || "Unavailable"} />
          <DetailRow
            label="Workspace"
            value={record.workspace_name || "Unavailable"}
          />
          <DetailRow
            label="App"
            value={record.app_version || "Unavailable"}
          />
          <DetailRow
            label="Platform"
            value={record.platform || "Unavailable"}
          />
          <DetailRow
            label="Recipient"
            value={record.recipient_email || "Unavailable"}
          />
          <DetailRow
            label="Email ID"
            value={record.email_id || "Unavailable"}
          />
          {record.email_error ? (
            <DetailRow label="Email error" value={record.email_error} isError />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function DetailRow({
  isError = false,
  label,
  value,
}: {
  isError?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, isError && styles.detailError]}>
        {value}
      </Text>
    </View>
  );
}

function getCategoryDetails(type: string) {
  switch (type) {
    case "bug":
      return {
        background: "#3A171D",
        color: "#F87171",
        icon: "bug-outline" as const,
        label: "Bug",
      };
    case "suggestion":
      return {
        background: "#2F2612",
        color: "#FBBF24",
        icon: "bulb-outline" as const,
        label: "Suggestion",
      };
    case "help":
      return {
        background: "#142B3D",
        color: "#38BDF8",
        icon: "help-circle-outline" as const,
        label: "Help",
      };
    default:
      return {
        background: "#1E293B",
        color: "#94A3B8",
        icon: "chatbubble-ellipses-outline" as const,
        label: type || "Feedback",
      };
  }
}

function getDeliveryDetails(status: string) {
  switch (status) {
    case "emailed":
      return {
        background: "#123426",
        color: "#34D399",
        label: "Emailed",
      };
    case "email_failed":
      return {
        background: "#3A171D",
        color: "#F87171",
        label: "Email Failed",
      };
    default:
      return {
        background: "#2F2612",
        color: "#FBBF24",
        label: "Saved",
      };
  }
}

function formatDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B1220",
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
    paddingBottom: 32,
  },

  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },

  summaryCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 16,
    backgroundColor: "#121C2D",
    borderWidth: 1,
    borderColor: "#26364F",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryValue: {
    fontSize: 23,
    fontWeight: "900",
  },

  summaryLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 4,
  },

  searchCard: {
    backgroundColor: "#121C2D",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 12,
    marginBottom: 12,
  },

  searchRow: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#0C1524",
    borderWidth: 1,
    borderColor: "#26364F",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 10,
  },

  searchButton: {
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },

  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  filterRow: {
    gap: 8,
    paddingBottom: 14,
  },

  filterChip: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: "#121C2D",
    borderWidth: 1,
    borderColor: "#26364F",
    alignItems: "center",
    justifyContent: "center",
  },

  filterChipSelected: {
    backgroundColor: "#1D4ED8",
    borderColor: "#60A5FA",
  },

  filterChipText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
  },

  filterChipTextSelected: {
    color: "#FFFFFF",
  },

  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },

  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 12,
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    backgroundColor: "#121C2D",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#26364F",
  },

  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 12,
  },

  emptyText: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 5,
  },

  feedbackCard: {
    backgroundColor: "#121C2D",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 15,
    marginBottom: 12,
  },

  cardPressed: {
    opacity: 0.86,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  cardHeaderText: {
    flex: 1,
  },

  cardTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  cardMeta: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 3,
  },

  message: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 13,
  },

  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 13,
  },

  statusBadge: {
    minHeight: 29,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "900",
  },

  typeBadge: {
    minHeight: 29,
    borderRadius: 999,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  typeBadgeText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "800",
  },

  details: {
    borderTopWidth: 1,
    borderTopColor: "#26364F",
    marginTop: 14,
    paddingTop: 12,
    gap: 10,
  },

  detailRow: {
    gap: 3,
  },

  detailLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  detailValue: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
  },

  detailError: {
    color: "#FCA5A5",
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});
