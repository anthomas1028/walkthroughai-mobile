import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
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

type Customer = {
  id: number;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

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

type RecentVendor = {
  vendor: string;
  item_count: number;
  last_seen_at: string | null;
};

type Dashboard = {
  customer: Customer;
  total_walkthroughs: number;
  total_inventory_items: number;
  total_photos: number;
  archived_walkthroughs: number;
  review_item_count: number;
  last_walkthrough_at: string | null;
  recent_walkthroughs: WalkthroughSummary[];
  recent_vendors: RecentVendor[];
};

type DashboardResponse = {
  success: boolean;
  dashboard?: Dashboard;
  error?: string;
};

function parseBackendDate(value: string): Date {
  const cleanedValue = value.trim();

  const hasTimezone =
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleanedValue);

  const normalizedValue = hasTimezone
    ? cleanedValue
    : `${cleanedValue}Z`;

  return new Date(normalizedValue);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No walkthroughs yet";
  }

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

export default function CustomerDashboardScreen() {
  const params = useLocalSearchParams<{
    customerId?: string;
    customerName?: string;
  }>();

  const customerId = Number(params.customerId || 0);

  const fallbackCustomerName =
    typeof params.customerName === "string"
      ? params.customerName
      : "Customer";

  const [dashboard, setDashboard] =
    useState<Dashboard | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const loadDashboard = useCallback(
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
          `${API_BASE_URL}/api/customers/${customerId}/dashboard`
        );

        const responseText = await response.text();

        let data: DashboardResponse;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            "The backend returned an unreadable response."
          );
        }

        if (
          !response.ok ||
          !data.success ||
          !data.dashboard
        ) {
          throw new Error(
            data.error ||
              "The customer dashboard could not be loaded."
          );
        }

        setDashboard(data.dashboard);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The customer dashboard could not be loaded.";

        Alert.alert(
          "Unable to load dashboard",
          `${message}\n\nMake sure the phone has an internet connection and the online service is available.`
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [customerId]
  );

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  function openHistory() {
    const customerName =
      dashboard?.customer.company_name ||
      fallbackCustomerName;

    router.push({
      pathname: "/history",
      params: {
        customerId: String(customerId),
        customerName,
      },
    });
  }

  function openWalkthrough(
    walkthrough: WalkthroughSummary
  ) {
    router.push({
      pathname: "/walkthrough-detail",
      params: {
        walkthroughId: String(walkthrough.id),
        customerName:
          dashboard?.customer.company_name ||
          fallbackCustomerName,
      },
    });
  }

  function renderWalkthrough({
    item,
  }: {
    item: WalkthroughSummary;
  }) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => openWalkthrough(item)}
        style={({ pressed }) => [
          styles.walkthroughCard,
          pressed && styles.buttonPressed,
        ]}
      >
        <View style={styles.walkthroughTopRow}>
          <View style={styles.walkthroughTitleArea}>
            <Text style={styles.walkthroughTitle}>
              Walkthrough #{item.id}
            </Text>
            <Text style={styles.walkthroughDate}>
              {formatDate(item.completed_at)}
            </Text>
          </View>

          <Text style={styles.walkthroughArrow}>›</Text>
        </View>

        <Text style={styles.walkthroughSummary}>
          {item.item_count} items • {item.photo_count} photos
          {item.email_sent ? " • Emailed" : ""}
        </Text>
      </Pressable>
    );
  }

  const customerName =
    dashboard?.customer.company_name ||
    fallbackCustomerName;

  const activeWalkthroughs = dashboard
    ? Math.max(
        0,
        dashboard.total_walkthroughs -
          dashboard.archived_walkthroughs
      )
    : 0;

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
              Customer Dashboard
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
              Loading dashboard…
            </Text>
          </View>
        ) : dashboard ? (
          <FlatList
            contentContainerStyle={styles.content}
            data={dashboard.recent_walkthroughs}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl
                onRefresh={() => {
                  setIsRefreshing(true);
                  loadDashboard(false);
                }}
                refreshing={isRefreshing}
                tintColor="#3B82F6"
              />
            }
            renderItem={renderWalkthrough}
            ListHeaderComponent={
              <>
                <View style={styles.customerCard}>
                  <Text style={styles.customerName}>
                    {dashboard.customer.company_name}
                  </Text>

                  {dashboard.customer.contact_name ? (
                    <Text style={styles.customerDetail}>
                      {dashboard.customer.contact_name}
                    </Text>
                  ) : null}

                  {dashboard.customer.email ? (
                    <Text style={styles.customerDetail}>
                      {dashboard.customer.email}
                    </Text>
                  ) : null}

                  {dashboard.customer.notes ? (
                    <Text style={styles.customerNotes}>
                      {dashboard.customer.notes}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.statGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {dashboard.total_walkthroughs}
                    </Text>
                    <Text style={styles.statLabel}>
                      Total Walkthroughs
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {dashboard.total_inventory_items}
                    </Text>
                    <Text style={styles.statLabel}>
                      Inventory Items
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {activeWalkthroughs}
                    </Text>
                    <Text style={styles.statLabel}>
                      Active
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {dashboard.archived_walkthroughs}
                    </Text>
                    <Text style={styles.statLabel}>
                      Archived
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {dashboard.total_photos}
                    </Text>
                    <Text style={styles.statLabel}>
                      Photos
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <Text
                      style={[
                        styles.statNumber,
                        dashboard.review_item_count > 0 &&
                          styles.reviewStatNumber,
                      ]}
                    >
                      {dashboard.review_item_count}
                    </Text>
                    <Text style={styles.statLabel}>
                      Review Items
                    </Text>
                  </View>
                </View>

                <View style={styles.lastVisitCard}>
                  <Text style={styles.sectionEyebrow}>
                    LAST WALKTHROUGH
                  </Text>
                  <Text style={styles.lastVisitText}>
                    {formatDate(
                      dashboard.last_walkthrough_at
                    )}
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>
                  Recent Vendors
                </Text>

                <View style={styles.vendorCard}>
                  {dashboard.recent_vendors.length > 0 ? (
                    dashboard.recent_vendors.map(
                      (vendor, index) => (
                        <View
                          key={`${vendor.vendor}-${index}`}
                          style={[
                            styles.vendorRow,
                            index ===
                              dashboard.recent_vendors.length -
                                1 &&
                              styles.vendorRowLast,
                          ]}
                        >
                          <View style={styles.vendorTextArea}>
                            <Text style={styles.vendorName}>
                              {vendor.vendor}
                            </Text>
                            <Text style={styles.vendorDate}>
                              Last seen{" "}
                              {formatDate(vendor.last_seen_at)}
                            </Text>
                          </View>

                          <View style={styles.vendorCountBadge}>
                            <Text style={styles.vendorCountText}>
                              {vendor.item_count}
                            </Text>
                          </View>
                        </View>
                      )
                    )
                  ) : (
                    <Text style={styles.emptySectionText}>
                      No vendors have been saved yet.
                    </Text>
                  )}
                </View>

                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    Recent Walkthroughs
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    onPress={openHistory}
                  >
                    <Text style={styles.viewAllText}>
                      View All
                    </Text>
                  </Pressable>
                </View>
              </>
            }
            ListEmptyComponent={
              <View style={styles.emptyWalkthroughCard}>
                <Text style={styles.emptySectionText}>
                  No active walkthroughs are available.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={openHistory}
                  style={({ pressed }) => [
                    styles.historyButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.historyButtonText}>
                    Open History
                  </Text>
                </Pressable>
              </View>
            }
          />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.emptySectionText}>
              Dashboard unavailable.
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
    marginTop: -3,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 3,
  },

  content: {
    paddingBottom: 30,
  },

  customerCard: {
    backgroundColor: "#14243A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#31547D",
    padding: 16,
    marginBottom: 12,
  },

  customerName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },

  customerDetail: {
    color: "#BFDBFE",
    fontSize: 13,
    marginTop: 5,
  },

  customerNotes: {
    color: "#AAB7CA",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },

  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },

  statCard: {
    width: "33.3333%",
    paddingHorizontal: 5,
    marginBottom: 10,
  },

  statNumber: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    backgroundColor: "#121C2D",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#26364F",
    paddingTop: 12,
    paddingBottom: 4,
  },

  reviewStatNumber: {
    color: "#FDE68A",
  },

  statLabel: {
    color: "#718096",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "#121C2D",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#26364F",
    minHeight: 39,
    paddingHorizontal: 5,
    paddingBottom: 10,
  },

  lastVisitCard: {
    backgroundColor: "#0C1524",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 15,
    marginBottom: 19,
  },

  sectionEyebrow: {
    color: "#718096",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  lastVisitText: {
    color: "#D8E2F0",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 5,
  },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },

  vendorCard: {
    backgroundColor: "#121C2D",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#26364F",
    paddingHorizontal: 15,
    marginBottom: 20,
  },

  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#26364F",
  },

  vendorRowLast: {
    borderBottomWidth: 0,
  },

  vendorTextArea: {
    flex: 1,
  },

  vendorName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  vendorDate: {
    color: "#718096",
    fontSize: 11,
    marginTop: 4,
  },

  vendorCountBadge: {
    minWidth: 34,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
  },

  vendorCountText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  viewAllText: {
    color: "#93C5FD",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },

  walkthroughCard: {
    backgroundColor: "#121C2D",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 15,
    marginBottom: 10,
  },

  walkthroughTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  walkthroughTitleArea: {
    flex: 1,
  },

  walkthroughTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  walkthroughDate: {
    color: "#718096",
    fontSize: 11,
    marginTop: 4,
  },

  walkthroughArrow: {
    color: "#93C5FD",
    fontSize: 26,
    fontWeight: "700",
  },

  walkthroughSummary: {
    color: "#BFDBFE",
    fontSize: 12,
    marginTop: 10,
  },

  emptyWalkthroughCard: {
    backgroundColor: "#121C2D",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#26364F",
    padding: 17,
    alignItems: "center",
  },

  emptySectionText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  historyButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 13,
  },

  historyButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
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

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});