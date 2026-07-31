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
    TextInput,
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
  archived_at: string | null;
};

type HistoryResponse = {
  success: boolean;
  walkthroughs?: WalkthroughSummary[];
  walkthrough_count?: number;
  error?: string;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString();
}

export default function ArchivedHistoryScreen() {
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
  const [restoringId, setRestoringId] = useState<
    number | null
  >(null);
  const [searchText, setSearchText] = useState("");

  const loadArchived = useCallback(
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
        const searchParameters = new URLSearchParams({
          include_archived: "true",
        });

        if (searchText.trim()) {
          searchParameters.set(
            "search",
            searchText.trim()
          );
        }

        const response = await fetch(
          `${API_BASE_URL}/api/customers/${customerId}/walkthroughs?${searchParameters.toString()}`
        );

        const responseText = await response.text();

        let data: HistoryResponse;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            "The backend returned an unreadable response."
          );
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
              "Archived walkthroughs could not be loaded."
          );
        }

        const archivedWalkthroughs =
          (data.walkthroughs || []).filter(
            (item) => item.is_archived
          );

        setWalkthroughs(archivedWalkthroughs);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Archived walkthroughs could not be loaded.";

        Alert.alert(
          "Unable to load archived walkthroughs",
          `${message}\n\nMake sure the backend is running and the phone is connected to the same Wi-Fi network as the MacBook.`
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [customerId, searchText]
  );

  useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  async function restoreWalkthrough(
    walkthrough: WalkthroughSummary
  ) {
    setRestoringId(walkthrough.id);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/walkthroughs/${walkthrough.id}/archive`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            is_archived: false,
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
          "The backend returned an unreadable response."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "The walkthrough could not be restored."
        );
      }

      setWalkthroughs((currentWalkthroughs) =>
        currentWalkthroughs.filter(
          (item) => item.id !== walkthrough.id
        )
      );

      Alert.alert(
        "Walkthrough restored",
        `Walkthrough #${walkthrough.id} is visible in normal history again.`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The walkthrough could not be restored.";

      Alert.alert(
        "Unable to restore walkthrough",
        message
      );
    } finally {
      setRestoringId(null);
    }
  }

  function confirmRestore(
    walkthrough: WalkthroughSummary
  ) {
    Alert.alert(
      "Restore walkthrough?",
      `Walkthrough #${walkthrough.id} will return to the customer's normal history.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Restore",
          onPress: () =>
            restoreWalkthrough(walkthrough),
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
              Completed {formatDate(item.completed_at)}
            </Text>

            {item.archived_at ? (
              <Text style={styles.archivedDate}>
                Archived {formatDate(item.archived_at)}
              </Text>
            ) : null}
          </View>

          <View style={styles.archivedBadge}>
            <Text style={styles.archivedBadgeText}>
              Archived
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

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={restoringId === item.id}
            onPress={(event) => {
              event.stopPropagation();
              confirmRestore(item);
            }}
            style={({ pressed }) => [
              styles.restoreButton,
              pressed && styles.buttonPressed,
              restoringId === item.id &&
                styles.buttonDisabled,
            ]}
          >
            {restoringId === item.id ? (
              <ActivityIndicator
                color="#86EFAC"
                size="small"
              />
            ) : (
              <Text style={styles.restoreButtonText}>
                Restore
              </Text>
            )}
          </Pressable>

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
              Archived Walkthroughs
            </Text>

            <Text
              numberOfLines={1}
              style={styles.subtitle}
            >
              {customerName}
            </Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchText}
            onSubmitEditing={() => loadArchived()}
            placeholder="Search archived walkthroughs"
            placeholderTextColor="#64748B"
            returnKeyType="search"
            style={styles.searchInput}
            value={searchText}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => loadArchived()}
            style={({ pressed }) => [
              styles.searchButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.searchButtonText}>
              Search
            </Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              color="#3B82F6"
              size="large"
            />
            <Text style={styles.loadingText}>
              Loading archived walkthroughs…
            </Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={
              walkthroughs.length === 0
                ? styles.emptyList
                : styles.historyList
            }
            data={walkthroughs}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl
                onRefresh={() => {
                  setIsRefreshing(true);
                  loadArchived(false);
                }}
                refreshing={isRefreshing}
                tintColor="#3B82F6"
              />
            }
            renderItem={renderWalkthrough}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📦</Text>

                <Text style={styles.emptyTitle}>
                  No archived walkthroughs
                </Text>

                <Text style={styles.emptyDescription}>
                  Walkthroughs archived from normal history
                  will appear here.
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

  searchRow: {
    flexDirection: "row",
    marginBottom: 14,
  },

  searchInput: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    backgroundColor: "#121C2D",
    borderWidth: 1,
    borderColor: "#26364F",
    color: "#FFFFFF",
    fontSize: 14,
    paddingHorizontal: 14,
    marginRight: 8,
  },

  searchButton: {
    height: 46,
    borderRadius: 13,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
  },

  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  historyList: {
    paddingBottom: 24,
  },

  historyCard: {
    backgroundColor: "#121C2D",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#3F3F46",
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

  archivedDate: {
    color: "#A1A1AA",
    fontSize: 11,
    marginTop: 3,
  },

  archivedBadge: {
    backgroundColor: "#2A2520",
    borderWidth: 1,
    borderColor: "#57534E",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  archivedBadgeText: {
    color: "#D6D3D1",
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

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#26364F",
  },

  restoreButton: {
    minWidth: 82,
    minHeight: 36,
    borderRadius: 11,
    backgroundColor: "#123C2C",
    borderWidth: 1,
    borderColor: "#1F6B4D",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  restoreButtonText: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "800",
  },

  openRow: {
    flexDirection: "row",
    alignItems: "center",
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