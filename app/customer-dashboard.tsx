import { UI } from "../constants/design";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../lib/alerts";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,

  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL, apiFetch } from "../lib/api";

type Customer = {
  id: number;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  notes: string | null;
  logo_url?: string | null;
};

type Walkthrough = {
  id: number;
  item_count: number;
  photo_count: number;
  email_sent: boolean;
  completed_at: string;
};

type Vendor = {
  vendor: string;
  item_count: number;
  last_seen_at: string | null;
};

type LocationSummary = {
  name: string;
  item_count: number;
  photo_count: number;
  walkthrough_count: number;
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
  recent_walkthroughs: Walkthrough[];
  recent_vendors: Vendor[];
  locations: LocationSummary[];
  is_demo?: boolean;
  is_read_only?: boolean;
};

type CustomerResponse = {
  success: boolean;
  customer?: Customer;
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "No walkthroughs yet";

  const date = new Date(
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
  );

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function countLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export default function CustomerDashboardScreen() {
  const { width, fontScale } = useWindowDimensions();
  const wideStat = width < 360 || fontScale > 1.2;
  const params = useLocalSearchParams<{
    customerId?: string;
    customerName?: string;
    readOnly?: string;
    demo?: string;
  }>();

  const customerId = Number(params.customerId || 0);
  const fallback =
    typeof params.customerName === "string" ? params.customerName : "Customer";
  const requestedReadOnly =
    params.readOnly === "true" || params.demo === "true";

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (show = true) => {
      if (!customerId) return;

      if (show) setLoading(true);

      try {
        const [dashboardResponse, customerResponse] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/customers/${customerId}/dashboard`),
          apiFetch(`${API_BASE_URL}/api/customers/${customerId}`),
        ]);

        const dashboardData = await dashboardResponse.json();
        const customerData: CustomerResponse = await customerResponse.json();

        if (!dashboardResponse.ok || !dashboardData.success) {
          throw new Error(
            dashboardData.error || "Dashboard unavailable"
          );
        }

        if (!customerResponse.ok || !customerData.success || !customerData.customer) {
          throw new Error(
            customerData.error || "Customer details unavailable"
          );
        }

        setDashboard({
          ...dashboardData.dashboard,
          customer: {
            ...dashboardData.dashboard.customer,
            logo_url: customerData.customer.logo_url || null,
          },
        });
      } catch (error) {
        Alert.alert(
          "Unable to load dashboard",
          error instanceof Error ? error.message : "Dashboard unavailable"
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customerId]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const name = dashboard?.customer.company_name || fallback;
  const isReadOnly =
    requestedReadOnly || Boolean(dashboard?.is_read_only);
  const active = Math.max(
    0,
    (dashboard?.total_walkthroughs || 0) -
      (dashboard?.archived_walkthroughs || 0)
  );

  const openReport = (reportType: string, vendor = "") =>
    router.push({
      pathname: "/customer-report",
      params: {
        customerId: String(customerId),
        customerName: name,
        reportType,
        readOnly: isReadOnly ? "true" : "false",
        ...(vendor ? { vendor } : {}),
      },
    });

  const openLocation = (location: string) =>
    router.push({
      pathname: "/location-detail",
      params: {
        customerId: String(customerId),
        customerName: name,
        location,
        readOnly: isReadOnly ? "true" : "false",
      },
    });

  const openWalkthrough = (id: number) =>
    router.push({
      pathname: "/walkthrough-detail",
      params: {
        walkthroughId: String(id),
        customerName: name,
        readOnly: isReadOnly ? "true" : "false",
      },
    });

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <View style={s.titleRow}>
              <Text style={s.title}>Customer overview</Text>

              {isReadOnly ? (
                <View style={s.readOnlyBadge}>
                  <Text style={s.readOnlyBadgeText}>VIEW ONLY</Text>
                </View>
              ) : null}
            </View>

            <Text numberOfLines={1} style={s.subtitle}>
              {name}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={s.loading}>Loading dashboard…</Text>
          </View>
        ) : dashboard ? (
          <FlatList
            data={dashboard.recent_walkthroughs}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load(false);
                }}
                tintColor="#3B82F6"
              />
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openWalkthrough(item.id)}
                style={s.walkCard}
              >
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.walkTitle}>
                      Walkthrough #{item.id}
                    </Text>
                    <Text style={s.muted}>
                      {formatDate(item.completed_at)}
                    </Text>
                  </View>
                  <Text style={s.arrow}>›</Text>
                </View>

                <Text style={s.walkSummary}>
                  {item.item_count} items • {item.photo_count} photos
                  {item.email_sent ? " • Emailed" : ""}
                </Text>
              </Pressable>
            )}
            ListHeaderComponent={
              <>
                {!isReadOnly ? <View style={{ marginBottom: 16, gap: 10 }}>
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/walkthrough", params: { customerId: String(customerId), customerName: name, customerEmail: dashboard.customer.email || "", contactName: dashboard.customer.contact_name || "" } })} style={{ backgroundColor: "#2D6BF0", minHeight: UI.controlHeight, paddingVertical: 12, paddingHorizontal: 14, justifyContent: "center", borderRadius: UI.cardRadius }}><Text style={{ color: "white", textAlign: "center", fontWeight: "700", fontSize: 16 }}>Start walkthrough</Text></Pressable>
                  <View style={{ flexDirection: "row", gap: 12 }}>{[{ label: "History", route: "/history" }, { label: "Edit customer", route: "/customer-edit" }].map(action => <Pressable key={action.route} accessibilityRole="button" onPress={() => router.push({ pathname: action.route as any, params: { customerId: String(customerId), customerName: name } })} style={{ flex: 1, minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, justifyContent: "center", borderRadius: UI.cardRadius, backgroundColor: "#1b2c43" }}><Text style={{ color: "#bfdbfe", textAlign: "center", fontWeight: "600" }}>{action.label}</Text></Pressable>)}</View>
                </View> : null}
                {(isReadOnly || dashboard.customer.logo_url || dashboard.customer.contact_name || dashboard.customer.email || dashboard.customer.notes) ? <View style={s.customerCard}>
                  {isReadOnly ? (
                    <Text style={s.demoLabel}>
                      DEMO CUSTOMER · READ ONLY
                    </Text>
                  ) : null}

                  <View style={s.customerIdentityRow}>
                    {dashboard.customer.logo_url ? (
                      <View style={s.logoFrame}>
                        <Image
                          source={{ uri: dashboard.customer.logo_url }}
                          style={s.logoImage}
                          resizeMode="contain"
                        />
                      </View>
                    ) : null}

                    <View style={s.customerText}>
                      <Text style={s.customerName}>
                        {dashboard.customer.company_name}
                      </Text>

                      {dashboard.customer.contact_name ? (
                        <Text style={s.detail}>
                          {dashboard.customer.contact_name}
                        </Text>
                      ) : null}

                      {dashboard.customer.email ? (
                        <Text style={s.detail}>
                          {dashboard.customer.email}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {dashboard.customer.notes ? (
                    <Text style={s.notes}>
                      {dashboard.customer.notes}
                    </Text>
                  ) : null}
                </View> : null}

                <View style={s.stats}>
                  {[
                    [
                      dashboard.total_walkthroughs,
                      "Walkthroughs",
                      "walkthroughs",
                    ],
                    [
                      dashboard.total_inventory_items,
                      "Unique parts",
                      "inventory",
                    ],
                    [active, "Active", "active"],
                    [
                      dashboard.archived_walkthroughs,
                      "Archived",
                      "archived",
                    ],
                    [dashboard.total_photos, "Photos", "photos"],
                    [
                      dashboard.review_item_count,
                      "Rows to review",
                      "review",
                    ],
                  ].map(([number, label, report]) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${number} ${label}. Open report.`}
                      key={String(label)}
                      onPress={() => openReport(String(report))}
                      style={[s.stat, wideStat && s.statWide]}
                    >
                      <View style={s.statPanel}>
                        <Text style={s.statNum}>{String(number)}</Text>
                        <Text style={s.statLabel}>{String(label)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>

                <Text style={s.statsHint}>Unique parts are counted once. Review rows include repeat sightings across reports.</Text>

                <Pressable
                  onPress={() => openReport("last")}
                  style={s.last}
                >
                  <Text style={s.eyebrow}>LAST WALKTHROUGH</Text>
                  <Text style={s.lastText}>
                    {formatDate(dashboard.last_walkthrough_at)}
                  </Text>
                  <Text style={s.hint}>View report ›</Text>
                </Pressable>

                <Text style={s.section}>Locations</Text>

                <View style={s.listCard}>
                  {dashboard.locations.length ? (
                    dashboard.locations.map((location, index) => (
                      <Pressable
                        key={location.name}
                        onPress={() => openLocation(location.name)}
                        style={[
                          s.listRow,
                          index === dashboard.locations.length - 1 &&
                            s.lastRow,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.listName}>
                            {location.name}
                          </Text>
                          <Text style={s.muted}>
                            {countLabel(location.photo_count, "photo")} •{" "}
                            {countLabel(location.item_count, "item")} •{" "}
                            {countLabel(
                              location.walkthrough_count,
                              "walkthrough"
                            )}
                          </Text>
                        </View>

                        <Text style={s.arrow}>›</Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={s.empty}>
                      Locations will appear after a walkthrough is finalized.
                    </Text>
                  )}
                </View>

                <Text style={s.section}>Recent Vendors</Text>

                <View style={s.listCard}>
                  {dashboard.recent_vendors.length ? (
                    dashboard.recent_vendors.map((vendor, index) => (
                      <Pressable
                        key={vendor.vendor}
                        onPress={() =>
                          openReport("vendor", vendor.vendor)
                        }
                        style={[
                          s.listRow,
                          index === dashboard.recent_vendors.length - 1 &&
                            s.lastRow,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.listName}>
                            {vendor.vendor}
                          </Text>
                          <Text style={s.muted}>
                            Last seen {formatDate(vendor.last_seen_at)}
                          </Text>
                        </View>

                        <View style={s.badge}>
                          <Text style={s.badgeText}>
                            {vendor.item_count}
                          </Text>
                        </View>

                        <Text style={s.arrow}>›</Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={s.empty}>No vendors saved yet.</Text>
                  )}
                </View>

                <View style={s.sectionRow}>
                  <Text style={s.section}>Recent Walkthroughs</Text>

                  <Pressable
                    onPress={() =>
                      isReadOnly
                        ? openReport("walkthroughs")
                        : router.push({
                            pathname: "/history",
                            params: {
                              customerId: String(customerId),
                              customerName: name,
                            },
                          })
                    }
                  >
                    <Text style={s.viewAll}>View All</Text>
                  </Pressable>
                </View>
              </>
            }
            ListEmptyComponent={
              <Text style={s.empty}>
                No active walkthroughs are available.
              </Text>
            }
          />
        ) : (
          <View style={s.center}>
            <Text style={s.empty}>Dashboard unavailable.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#091321",
  },
  container: { width: "100%", maxWidth: 1180, alignSelf: "center",
    flex: 1,
    paddingHorizontal: UI.screenPadding,
    paddingTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  back: {
    flexShrink: 0,
    width: UI.navigationSize,
    height: UI.navigationSize,
    borderRadius: 14,
    backgroundColor: "#17243A",
    borderWidth: 1,
    borderColor: "#31547D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  backText: {
    color: "#FFF",
    fontSize: 34,
    lineHeight: 36,
    marginTop: -3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    lineHeight: 28,
    color: "#FFF",
    fontSize: UI.pageTitle,
    fontWeight: "800",
  },
  readOnlyBadge: {
    borderRadius: 999,
    backgroundColor: "#17372E",
    borderWidth: 1,
    borderColor: "#2A6A55",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  readOnlyBadgeText: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 3,
  },
  content: {
    paddingBottom: 30,
  },
  demoLabel: {
    color: "#86EFAC",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  customerCard: {
    backgroundColor: "#17283D",
    borderRadius: UI.cardRadius,
    borderWidth: 1,
    borderColor: "#31547D",
    padding: UI.cardPadding,
    marginBottom: 12,
  },
  customerIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoFrame: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E2EC",
    padding: 7,
    marginRight: 14,
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  customerText: {minWidth: 0,
    flex: 1,
  },
  customerName: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "800",
  },
  detail: {
    color: "#BFDBFE",
    fontSize: 13,
    marginTop: 5,
  },
  notes: {
    color: "#AAB7CA",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },
  stat: {
    width: "33.333%",
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  statWide: { width: "50%" },
  statPanel: {
    flex: 1,
    minHeight: 74,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: UI.cardRadius,
    backgroundColor: "#15263B",
    borderWidth: 1,
    borderColor: "#30465F",
  },
  statNum: { color: "#73DCE7", fontSize: UI.metricValue, lineHeight: 24, fontWeight: "700", textAlign: "center" },
  statLabel: { color: "#B8C8DB", fontSize: 12, lineHeight: 16, minHeight: 32, fontWeight: "600", textAlign: "center", marginTop: 2 },
  statsHint: { color: "#AAB7CA", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  last: {
    backgroundColor: "#0C1524",
    borderRadius: UI.cardRadius,
    borderWidth: 1,
    borderColor: "#30465F",
    padding: UI.cardPadding,
    marginBottom: 12,
  },
  eyebrow: {
    color: "#AAB7CA",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  lastText: {
    color: "#D8E2F0",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 5,
  },
  hint: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 7,
  },
  section: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewAll: {
    color: "#93C5FD",
    fontWeight: "800",
    marginBottom: 10,
  },
  listCard: {
    backgroundColor: "#15263B",
    borderRadius: UI.cardRadius,
    borderWidth: 1,
    borderColor: "#30465F",
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#2B3E56",
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  listName: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
  },
  muted: {
    color: "#AAB7CA",
    fontSize: 12,
    lineHeight: 15,
    marginTop: 3,
  },
  badge: {
    minWidth: 34,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#2D6BF0",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
  },
  arrow: {
    color: "#93C5FD",
    fontSize: 25,
    fontWeight: "800",
    marginLeft: 8,
  },
  walkCard: {
    backgroundColor: "#15263B",
    borderRadius: UI.cardRadius,
    borderWidth: 1,
    borderColor: "#30465F",
    padding: UI.cardPadding,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  walkTitle: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
  },
  walkSummary: {
    color: "#BFDBFE",
    fontSize: 12,
    marginTop: 10,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 12,
  },
  empty: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    paddingVertical: 18,
  },
});
