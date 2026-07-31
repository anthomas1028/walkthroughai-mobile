import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const API_BASE_URL = "https://walkthroughai-api.onrender.com";

type WalkthroughSummary = {
  id: number;
  customer_id: number;
  customer_name: string;
  status: string;
  item_count: number;
  photo_count: number;
  workbook_file: string | null;
  download_url: string | null;
  email_requested: boolean;
  email_sent: boolean;
  recipient_email: string | null;
  email_id: string | null;
  email_error: string | null;
  started_at: string | null;
  completed_at: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
};

type HistoryResponse = {
  success: boolean;
  walkthroughs?: WalkthroughSummary[];
  walkthrough_count?: number;
  error?: string;
};

function parseBackendDate(value: string): Date {
  const cleanedValue = value.trim();

  const hasTimezone =
    /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(cleanedValue);

  return new Date(
    hasTimezone ? cleanedValue : `${cleanedValue}Z`
  );
}

function formatDate(value: string): string {
  const parsedDate = parseBackendDate(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HistoryScreen() {
  const params = useLocalSearchParams<{
    customerId?: string;
    customerName?: string;
  }>();

  const customerId = Number(params.customerId || 0);
  const customerName =
    typeof params.customerName === "string"
      ? params.customerName
      : "Customer";

  const [walkthroughs, setWalkthroughs] = useState<
    WalkthroughSummary[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [updatingWalkthroughId, setUpdatingWalkthroughId] =
    useState<number | null>(null);
  const [deletingWalkthroughId, setDeletingWalkthroughId] =
    useState<number | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const loadHistory = useCallback(
    async (showLoadingIndicator: boolean = true) => {
      if (!customerId) {
        Alert.alert(
          "Customer unavailable",
          "The selected customer could not be identified."
        );
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (showLoadingIndicator) {
        setIsLoading(true);
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/customers/${customerId}/walkthroughs?include_archived=${showArchived ? "true" : "false"}`
        );

        const responseText = await response.text();

        let data: HistoryResponse;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            "Walkthrough AI received an unexpected response. Please try again."
          );
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Walkthrough AI couldn’t load the walkthrough history. Please try again."
          );
        }

        setWalkthroughs(data.walkthroughs || []);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Walkthrough AI couldn’t load the walkthrough history. Please try again.";

        Alert.alert(
          "Unable to load history",
          `${message}\n\nCheck your internet connection and try again.`
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [customerId, showArchived]
  );

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function updateArchiveStatus(
    walkthrough: WalkthroughSummary
  ) {
    setUpdatingWalkthroughId(walkthrough.id);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/walkthroughs/${walkthrough.id}/archive`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            is_archived: !walkthrough.is_archived,
          }),
        }
      );

      const responseText = await response.text();

      let data: {
        success: boolean;
        error?: string;
      };

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "Walkthrough AI received an unexpected response. Please try again."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Walkthrough AI couldn’t update this walkthrough. Please try again."
        );
      }

      await loadHistory(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Walkthrough AI couldn’t update this walkthrough. Please try again.";

      Alert.alert(
        walkthrough.is_archived
          ? "Unable to restore walkthrough"
          : "Unable to archive walkthrough",
        message
      );
    } finally {
      setUpdatingWalkthroughId(null);
    }
  }

  function confirmArchiveChange(
    walkthrough: WalkthroughSummary
  ) {
    const action = walkthrough.is_archived
      ? "Restore"
      : "Archive";

    Alert.alert(
      `${action} walkthrough?`,
      walkthrough.is_archived
        ? `Walkthrough #${walkthrough.id} will return to the active history list.`
        : `Walkthrough #${walkthrough.id} will be hidden from the active history list but will not be deleted.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: action,
          onPress: () =>
            updateArchiveStatus(walkthrough),
        },
      ]
    );
  }


  async function deleteWalkthrough(
    walkthroughId: number
  ) {
    setDeletingWalkthroughId(walkthroughId);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/walkthroughs/${walkthroughId}`,
        {
          method: "DELETE",
        }
      );

      const responseText = await response.text();

      let data: {
        success: boolean;
        error?: string;
      };

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "Walkthrough AI received an unexpected response. Please try again."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Walkthrough AI couldn’t delete this walkthrough. Please try again."
        );
      }

      setWalkthroughs((currentWalkthroughs) =>
        currentWalkthroughs.filter(
          (walkthrough) =>
            walkthrough.id !== walkthroughId
        )
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Walkthrough AI couldn’t delete this walkthrough. Please try again.";

      Alert.alert(
        "Unable to delete walkthrough",
        message
      );
    } finally {
      setDeletingWalkthroughId(null);
    }
  }

  function confirmDeleteWalkthrough(
    walkthrough: WalkthroughSummary
  ) {
    Alert.alert(
      "Delete permanently?",
      `Walkthrough #${walkthrough.id} and all saved inventory items will be permanently deleted. This cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete Permanently",
          style: "destructive",
          onPress: () =>
            deleteWalkthrough(walkthrough.id),
        },
      ]
    );
  }

  async function archiveAllActiveWalkthroughs() {
    const activeWalkthroughs = walkthroughs.filter(
      (walkthrough) => !walkthrough.is_archived
    );

    if (activeWalkthroughs.length === 0) {
      return;
    }

    setIsBulkUpdating(true);

    try {
      for (const walkthrough of activeWalkthroughs) {
        const response = await fetch(
          `${API_BASE_URL}/api/walkthroughs/${walkthrough.id}/archive`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ is_archived: true }),
          }
        );

        const responseText = await response.text();
        let data: { success: boolean; error?: string };

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            `Walkthrough #${walkthrough.id} returned an unexpected response.`
          );
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || `Walkthrough #${walkthrough.id} could not be archived.`
          );
        }
      }

      await loadHistory(false);
    } catch (error) {
      Alert.alert(
        "Archive All stopped",
        error instanceof Error
          ? error.message
          : "Walkthrough AI could not archive every walkthrough."
      );
      await loadHistory(false);
    } finally {
      setIsBulkUpdating(false);
    }
  }

  function confirmArchiveAll() {
    const activeCount = walkthroughs.filter(
      (walkthrough) => !walkthrough.is_archived
    ).length;

    if (activeCount === 0) {
      return;
    }

    Alert.alert(
      "Archive all active walkthroughs?",
      `${activeCount} ${activeCount === 1 ? "walkthrough" : "walkthroughs"} will move to Archived. Nothing will be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive All",
          onPress: archiveAllActiveWalkthroughs,
        },
      ]
    );
  }

  async function deleteAllArchivedWalkthroughs() {
    const archivedWalkthroughs = walkthroughs.filter(
      (walkthrough) => walkthrough.is_archived
    );

    if (archivedWalkthroughs.length === 0) {
      return;
    }

    setIsBulkUpdating(true);

    try {
      for (const walkthrough of archivedWalkthroughs) {
        const response = await fetch(
          `${API_BASE_URL}/api/walkthroughs/${walkthrough.id}`,
          { method: "DELETE" }
        );

        const responseText = await response.text();
        let data: { success: boolean; error?: string };

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            `Walkthrough #${walkthrough.id} returned an unexpected response.`
          );
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || `Walkthrough #${walkthrough.id} could not be deleted.`
          );
        }
      }

      await loadHistory(false);
    } catch (error) {
      Alert.alert(
        "Delete All stopped",
        error instanceof Error
          ? error.message
          : "Walkthrough AI could not delete every archived walkthrough."
      );
      await loadHistory(false);
    } finally {
      setIsBulkUpdating(false);
    }
  }

  function confirmDeleteAll() {
    const archivedCount = walkthroughs.filter(
      (walkthrough) => walkthrough.is_archived
    ).length;

    if (archivedCount === 0) {
      return;
    }

    Alert.alert(
      "Delete all archived walkthroughs?",
      `${archivedCount} ${archivedCount === 1 ? "walkthrough" : "walkthroughs"} and all saved inventory items will be permanently deleted. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All Permanently",
          style: "destructive",
          onPress: deleteAllArchivedWalkthroughs,
        },
      ]
    );
  }

  function renderWalkthrough({
    item,
  }: {
    item: WalkthroughSummary;
  }) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname: "/walkthrough-detail",
            params: {
              walkthroughId: String(item.id),
              customerName,
            },
          })
        }
        style={({ pressed }) => [
          styles.historyCard,
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleArea}>
            <Text style={styles.walkthroughTitle}>
              Walkthrough #{item.id}
            </Text>

            <Text style={styles.walkthroughDate}>
              {formatDate(item.completed_at)}
            </Text>
          </View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {item.status === "completed"
                ? "Completed"
                : item.status}
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {item.item_count}
            </Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {item.photo_count}
            </Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {item.email_sent ? "Yes" : "No"}
            </Text>
            <Text style={styles.statLabel}>Emailed</Text>
          </View>
        </View>

        {item.workbook_file ? (
          <Text style={styles.fileName}>
            {item.workbook_file}
          </Text>
        ) : null}

        {item.recipient_email ? (
          <Text style={styles.emailText}>
            Sent to {item.recipient_email}
          </Text>
        ) : null}

        {item.email_error ? (
          <Text style={styles.errorText}>
            Email error: {item.email_error}
          </Text>
        ) : null}
        <View style={styles.cardActionRow}>
          <View style={styles.leftActions}>
            <Pressable
              accessibilityRole="button"
              disabled={
                isBulkUpdating ||
                updatingWalkthroughId === item.id ||
                deletingWalkthroughId === item.id
              }
              onPress={(event) => {
                event.stopPropagation();
                confirmArchiveChange(item);
              }}
              style={({ pressed }) => [
                styles.archiveButton,
                item.is_archived &&
                  styles.restoreButton,
                pressed && styles.buttonPressed,
                (updatingWalkthroughId === item.id ||
                  deletingWalkthroughId === item.id) &&
                  styles.buttonDisabled,
              ]}
            >
              {updatingWalkthroughId === item.id ? (
                <ActivityIndicator
                  color="#FDE68A"
                  size="small"
                />
              ) : (
                <Text style={styles.archiveButtonText}>
                  {item.is_archived
                    ? "Restore"
                    : "Archive"}
                </Text>
              )}
            </Pressable>

            {item.is_archived ? (
              <Pressable
                accessibilityRole="button"
                disabled={
                  isBulkUpdating ||
                  deletingWalkthroughId === item.id ||
                  updatingWalkthroughId === item.id
                }
                onPress={(event) => {
                  event.stopPropagation();
                  confirmDeleteWalkthrough(item);
                }}
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.buttonPressed,
                  (deletingWalkthroughId === item.id ||
                    updatingWalkthroughId === item.id) &&
                    styles.buttonDisabled,
                ]}
              >
                {deletingWalkthroughId === item.id ? (
                  <ActivityIndicator
                    color="#FCA5A5"
                    size="small"
                  />
                ) : (
                  <Text style={styles.deleteButtonText}>
                    Delete
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          <View style={styles.openRow}>
            <Text style={styles.openText}>
              View Items
            </Text>
            <Text style={styles.openArrow}>›</Text>
          </View>
        </View>
      </Pressable>
    );
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
            <Text style={styles.title}>
              Walkthrough History
            </Text>

            <Text
              numberOfLines={1}
              style={styles.subtitle}
            >
              {customerName}
            </Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowArchived(false)}
            style={[
              styles.filterButton,
              !showArchived &&
                styles.filterButtonSelected,
            ]}
          >
            <Text
              style={[
                styles.filterButtonText,
                !showArchived &&
                  styles.filterButtonTextSelected,
              ]}
            >
              Active
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setShowArchived(true)}
            style={[
              styles.filterButton,
              showArchived &&
                styles.filterButtonSelected,
            ]}
          >
            <Text
              style={[
                styles.filterButtonText,
                showArchived &&
                  styles.filterButtonTextSelected,
              ]}
            >
              Archived
            </Text>
          </Pressable>
        </View>

        {!isLoading && walkthroughs.length > 0 ? (
          <View style={styles.bulkActionBar}>
            <View style={styles.bulkActionTextArea}>
              <Text style={styles.bulkActionTitle}>
                {showArchived ? "Archived walkthroughs" : "Active walkthroughs"}
              </Text>
              <Text style={styles.bulkActionCount}>
                {walkthroughs.filter((item) =>
                  showArchived ? item.is_archived : !item.is_archived
                ).length} shown
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={
                isBulkUpdating ||
                walkthroughs.filter((item) =>
                  showArchived ? item.is_archived : !item.is_archived
                ).length === 0
              }
              onPress={showArchived ? confirmDeleteAll : confirmArchiveAll}
              style={({ pressed }) => [
                styles.bulkActionButton,
                showArchived && styles.bulkDeleteButton,
                pressed && styles.buttonPressed,
                isBulkUpdating && styles.buttonDisabled,
              ]}
            >
              {isBulkUpdating ? (
                <ActivityIndicator
                  size="small"
                  color={showArchived ? "#FCA5A5" : "#FDE68A"}
                />
              ) : (
                <Text
                  style={[
                    styles.bulkActionButtonText,
                    showArchived && styles.bulkDeleteButtonText,
                  ]}
                >
                  {showArchived ? "Delete All" : "Archive All"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              color="#3B82F6"
              size="large"
            />
            <Text style={styles.loadingText}>
              Loading walkthroughs…
            </Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={
              walkthroughs.length === 0
                ? styles.emptyList
                : styles.historyList
            }
            data={
              showArchived
                ? walkthroughs.filter(
                    (item) => item.is_archived
                  )
                : walkthroughs.filter(
                    (item) => !item.is_archived
                  )
            }
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl
                onRefresh={() => {
                  setIsRefreshing(true);
                  loadHistory(false);
                }}
                refreshing={isRefreshing}
                tintColor="#3B82F6"
              />
            }
            renderItem={renderWalkthrough}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🗂️</Text>
                <Text style={styles.emptyTitle}>
                  No walkthroughs yet
                </Text>
                <Text style={styles.emptyDescription}>
                  Completed walkthroughs for this customer
                  will appear here automatically.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
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
    marginBottom: 20,
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
    fontSize: 14,
    marginTop: 3,
  },

  filterRow: {
    flexDirection: "row",
    marginBottom: 14,
    backgroundColor: "#0C1524",
    borderRadius: 13,
    padding: 4,
  },

  filterButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  filterButtonSelected: {
    backgroundColor: "#1D4ED8",
  },

  filterButtonText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
  },

  filterButtonTextSelected: {
    color: "#FFFFFF",
  },

  bulkActionBar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#26364F",
    backgroundColor: "#101A2A",
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  bulkActionTextArea: {
    flex: 1,
    paddingRight: 10,
  },

  bulkActionTitle: {
    color: "#D7E2F0",
    fontSize: 12,
    fontWeight: "800",
  },

  bulkActionCount: {
    color: "#718096",
    fontSize: 10,
    marginTop: 2,
  },

  bulkActionButton: {
    minWidth: 94,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8A6A1F",
    backgroundColor: "#3A2D12",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  bulkDeleteButton: {
    borderColor: "#7F1D1D",
    backgroundColor: "#3A1720",
  },

  bulkActionButtonText: {
    color: "#FDE68A",
    fontSize: 11,
    fontWeight: "900",
  },

  bulkDeleteButtonText: {
    color: "#FCA5A5",
  },

  historyList: {
    paddingBottom: 24,
  },

  historyCard: {
    backgroundColor: "#121C2D",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 16,
    marginBottom: 12,
  },

  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  cardTitleArea: {
    flex: 1,
    paddingRight: 12,
  },

  walkthroughTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },

  walkthroughDate: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },

  statusBadge: {
    backgroundColor: "#123C2C",
    borderWidth: 1,
    borderColor: "#1F6B4D",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusBadgeText: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "800",
  },

  statRow: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 13,
  },

  statBox: {
    flex: 1,
    backgroundColor: "#0C1524",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    marginRight: 7,
  },

  statNumber: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },

  statLabel: {
    color: "#718096",
    fontSize: 11,
    marginTop: 3,
  },

  fileName: {
    color: "#BFDBFE",
    fontSize: 12,
    lineHeight: 18,
  },

  emailText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 5,
  },

  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  cardActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#26364F",
  },

  leftActions: {
    flexDirection: "row",
    alignItems: "center",
  },

  archiveButton: {
    minWidth: 84,
    minHeight: 36,
    borderRadius: 11,
    backgroundColor: "#3A2D12",
    borderWidth: 1,
    borderColor: "#8A6A1F",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  restoreButton: {
    backgroundColor: "#173A2B",
    borderColor: "#2E7D57",
  },

  archiveButtonText: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "800",
  },

  deleteButton: {
    minWidth: 78,
    minHeight: 36,
    borderRadius: 11,
    backgroundColor: "#3A1720",
    borderWidth: 1,
    borderColor: "#7F1D1D",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginLeft: 8,
  },

  deleteButtonText: {
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "800",
  },

  openRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },

  openText: {
    color: "#93C5FD",
    fontSize: 13,
    fontWeight: "800",
    marginRight: 5,
  },

  openArrow: {
    color: "#93C5FD",
    fontSize: 22,
    lineHeight: 22,
    fontWeight: "700",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 12,
  },

  emptyList: {
    flexGrow: 1,
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 70,
  },

  emptyIcon: {
    fontSize: 42,
    marginBottom: 12,
  },

  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
  },

  emptyDescription: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
    paddingHorizontal: 25,
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },

  buttonDisabled: {
    opacity: 0.45,
  },
});