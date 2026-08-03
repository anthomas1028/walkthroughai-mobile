import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
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
import { API_BASE_URL, apiFetch } from "../lib/api";


type WalkthroughItem = {
  id: number;
  walkthrough_id: number;
  item_number: number;
  photo: string | null;
  location: string | null;
  vendor: string | null;
  manufacturer: string | null;
  manufacturer_part_number: string | null;
  vendor_part_number: string | null;
  part_number: string | null;
  description: string | null;
  size_specification: string | null;
  package_quantity: string | null;
  label_text: string | null;
  confidence: number;
  review_needed: boolean;
  notes: string | null;
  was_edited: boolean;
  is_confirmed: boolean;
  created_at: string;
};

type Walkthrough = {
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
  items: WalkthroughItem[];
};

type WalkthroughResponse = {
  success: boolean;
  walkthrough?: Walkthrough;
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

function formatConfidence(value: number): string {
  const normalizedValue = value > 1 ? value / 100 : value;
  return `${Math.round(normalizedValue * 100)}%`;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) {
    return null;
  }

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

export default function WalkthroughDetailScreen() {
  const params = useLocalSearchParams<{
    walkthroughId?: string;
    customerName?: string;
  }>();

  const walkthroughId = Number(
    params.walkthroughId || 0
  );

  const customerName =
    typeof params.customerName === "string"
      ? params.customerName
      : "Customer";

  const [walkthrough, setWalkthrough] =
    useState<Walkthrough | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const [isSharing, setIsSharing] =
    useState(false);

  const loadWalkthrough = useCallback(
    async (showLoadingIndicator: boolean = true) => {
      if (!walkthroughId) {
        Alert.alert(
          "Walkthrough unavailable",
          "The selected walkthrough could not be identified."
        );
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (showLoadingIndicator) {
        setIsLoading(true);
      }

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/walkthroughs/${walkthroughId}`
        );

        const responseText = await response.text();

        let data: WalkthroughResponse;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            "Walkthrough AI received an unexpected response. Please try again."
          );
        }

        if (
          !response.ok ||
          !data.success ||
          !data.walkthrough
        ) {
          throw new Error(
            data.error ||
              "Walkthrough AI couldn’t load this walkthrough. Please try again."
          );
        }

        setWalkthrough(data.walkthrough);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Walkthrough AI couldn’t load this walkthrough. Please try again.";

        Alert.alert(
          "Unable to load walkthrough",
          `${message}\n\nCheck your internet connection and try again.`
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [walkthroughId]
  );

  useEffect(() => {
    loadWalkthrough();
  }, [loadWalkthrough]);

  async function downloadAndShareWorkbook() {
    if (
      !walkthrough?.download_url ||
      !walkthrough.workbook_file
    ) {
      Alert.alert(
        "Workbook unavailable",
        "This walkthrough does not have a saved workbook link."
      );
      return;
    }

    setIsSharing(true);

    try {
      const sharingAvailable =
        await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        throw new Error(
          "Sharing is not available on this device."
        );
      }

      const safeFileName =
        walkthrough.workbook_file.replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

      const localFileUri =
        `${FileSystem.cacheDirectory}${safeFileName}`;

      const downloadResult =
        await FileSystem.downloadAsync(
          walkthrough.download_url,
          localFileUri
        );

      if (downloadResult.status < 200 ||
          downloadResult.status >= 300) {
        throw new Error(
          "The workbook could not be downloaded. Please try again."
        );
      }

      await Sharing.shareAsync(
        downloadResult.uri,
        {
          dialogTitle:
            "Share Walkthrough Workbook",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          UTI:
            "org.openxmlformats.spreadsheetml.sheet",
        }
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Walkthrough AI couldn’t prepare the workbook for sharing. Please try again.";

      Alert.alert(
        "Unable to share workbook",
        `${message}\n\nCheck your internet connection and try again.`
      );
    } finally {
      setIsSharing(false);
    }
  }

  function renderItem({
    item,
  }: {
    item: WalkthroughItem;
  }) {
    const displayPartNumber =
      item.manufacturer_part_number ||
      item.vendor_part_number ||
      item.part_number;

    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemNumberBadge}>
            <Text style={styles.itemNumberText}>
              {item.item_number}
            </Text>
          </View>

          <View style={styles.itemHeaderText}>
            <Text style={styles.itemTitle}>
              {item.description || "Inventory Item"}
            </Text>

            {displayPartNumber ? (
              <Text style={styles.partNumber}>
                {displayPartNumber}
              </Text>
            ) : null}
          </View>

          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceText}>
              {formatConfidence(item.confidence)}
            </Text>
          </View>
        </View>

        <DetailRow label="Location" value={item.location} />
        <DetailRow label="Vendor" value={item.vendor} />
        <DetailRow
          label="Manufacturer"
          value={item.manufacturer}
        />
        <DetailRow
          label="Manufacturer Part #"
          value={item.manufacturer_part_number}
        />
        <DetailRow
          label="Vendor Part #"
          value={item.vendor_part_number}
        />
        <DetailRow
          label="Size / Specification"
          value={item.size_specification}
        />
        <DetailRow
          label="Package Quantity"
          value={item.package_quantity}
        />
        <DetailRow
          label="Photo"
          value={item.photo}
        />
        <DetailRow
          label="Notes"
          value={item.notes}
        />

        <View style={styles.itemStatusRow}>
          <Text style={styles.confirmedText}>
            {item.is_confirmed
              ? "✓ Confirmed"
              : "Not confirmed"}
          </Text>

          {item.was_edited ? (
            <Text style={styles.editedText}>
              Edited
            </Text>
          ) : null}
        </View>
      </View>
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
              Walkthrough Details
            </Text>

            <Text
              numberOfLines={1}
              style={styles.subtitle}
            >
              {customerName}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              color="#3B82F6"
              size="large"
            />
            <Text style={styles.loadingText}>
              Loading inventory items…
            </Text>
          </View>
        ) : walkthrough ? (
          <FlatList
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              styles.itemList
            }
            data={walkthrough.items || []}
            keyExtractor={(item) =>
              String(item.id)
            }
            refreshControl={
              <RefreshControl
                onRefresh={() => {
                  setIsRefreshing(true);
                  loadWalkthrough(false);
                }}
                refreshing={isRefreshing}
                tintColor="#3B82F6"
              />
            }
            renderItem={renderItem}
            ListHeaderComponent={
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View>
                    <Text style={styles.summaryTitle}>
                      Walkthrough #{walkthrough.id}
                    </Text>

                    <Text style={styles.summaryDate}>
                      {formatDate(
                        walkthrough.completed_at
                      )}
                    </Text>
                  </View>

                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>
                      Completed
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryStats}>
                  <Text style={styles.summaryStat}>
                    {walkthrough.item_count} items
                  </Text>
                  <Text style={styles.summaryDivider}>
                    •
                  </Text>
                  <Text style={styles.summaryStat}>
                    {walkthrough.photo_count} photos
                  </Text>
                  <Text style={styles.summaryDivider}>
                    •
                  </Text>
                  <Text style={styles.summaryStat}>
                    {walkthrough.email_sent
                      ? "Emailed"
                      : "Not emailed"}
                  </Text>
                </View>

                {walkthrough.recipient_email ? (
                  <Text style={styles.summaryEmail}>
                    Sent to {walkthrough.recipient_email}
                  </Text>
                ) : null}

                {walkthrough.workbook_file ? (
                  <Text style={styles.summaryFile}>
                    {walkthrough.workbook_file}
                  </Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={
                    isSharing ||
                    !walkthrough.download_url
                  }
                  onPress={downloadAndShareWorkbook}
                  style={({ pressed }) => [
                    styles.shareButton,
                    pressed && styles.buttonPressed,
                    (isSharing ||
                      !walkthrough.download_url) &&
                      styles.buttonDisabled,
                  ]}
                >
                  {isSharing ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                    />
                  ) : (
                    <Text
                      style={styles.shareButtonText}
                    >
                      Download & Share Workbook
                    </Text>
                  )}
                </Pressable>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>
                  No saved items
                </Text>
                <Text style={styles.emptyDescription}>
                  This walkthrough does not contain any saved inventory items.
                </Text>
              </View>
            }
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>
              Walkthrough unavailable
            </Text>
          </View>
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
    fontSize: 14,
    marginTop: 3,
  },

  itemList: {
    paddingBottom: 28,
  },

  summaryCard: {
    backgroundColor: "#14243A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#31547D",
    padding: 16,
    marginBottom: 14,
  },

  summaryTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  summaryTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
  },

  summaryDate: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },

  completedBadge: {
    backgroundColor: "#123C2C",
    borderWidth: 1,
    borderColor: "#1F6B4D",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  completedBadgeText: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "800",
  },

  summaryStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 14,
  },

  summaryStat: {
    color: "#BFDBFE",
    fontSize: 13,
    fontWeight: "700",
  },

  summaryDivider: {
    color: "#64748B",
    marginHorizontal: 7,
  },

  summaryEmail: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 11,
  },

  summaryFile: {
    color: "#BFDBFE",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  shareButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
  },

  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  itemCard: {
    backgroundColor: "#121C2D",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 16,
    marginBottom: 12,
  },

  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },

  itemNumberBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  itemNumberText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  itemHeaderText: {
    flex: 1,
    paddingRight: 8,
  },

  itemTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },

  partNumber: {
    color: "#93C5FD",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },

  confidenceBadge: {
    backgroundColor: "#0C1524",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  confidenceText: {
    color: "#A7F3D0",
    fontSize: 11,
    fontWeight: "800",
  },

  detailRow: {
    marginBottom: 10,
  },

  detailLabel: {
    color: "#718096",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 3,
  },

  detailValue: {
    color: "#D8E2F0",
    fontSize: 14,
    lineHeight: 20,
  },

  itemStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#26364F",
  },

  confirmedText: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "800",
  },

  editedText: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 12,
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

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
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
});
