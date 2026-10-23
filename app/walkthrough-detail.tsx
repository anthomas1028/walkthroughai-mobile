import { PhotoNavigation } from "../components/PhotoNavigation";
import { UI } from "../constants/design";
import { SourcingSummary } from "../components/SourcingSummary";
import { SavedSourcing } from "../lib/sourcing";
import { downloadInBrowser } from "../lib/download";
import { Alert } from "../lib/alerts";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,

  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL, apiFetch } from "../lib/api";

type WalkthroughItem = {
  customer_part_number?: string | null;
  fastenal_part_number?: string | null;
  sourcing_recommendation?: SavedSourcing | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_history?: Array<{ at: string; by: string; event: string }>;
  id: number;
  walkthrough_id: number;
  item_number: number;
  photo: string | null;
  photo_url?: string | null;
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
  completed_at: string;
  items: WalkthroughItem[];
};

type WalkthroughResponse = {
  success: boolean;
  walkthrough?: Walkthrough;
  error?: string;
};

type LocationGroup = {
  name: string;
  items: WalkthroughItem[];
  photoCount: number;
};

type PhotoViewer = {
  uri: string;
  label: string;
};

type MetricView = "photos" | "areas" | "vendors" | null;

type PhotoGroup = {
  name: string;
  item: WalkthroughItem;
  itemCount: number;
};

type VendorGroup = {
  name: string;
  items: WalkthroughItem[];
};

function parseBackendDate(value: string): Date {
  const cleanedValue = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleanedValue);
  return new Date(hasTimezone ? cleanedValue : `${cleanedValue}Z`);
}

function formatDate(value: string): string {
  const parsedDate = parseBackendDate(value);
  if (Number.isNaN(parsedDate.getTime())) return value;
  return parsedDate.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function plural(value: number, singular: string, pluralValue?: string): string {
  return `${value} ${value === 1 ? singular : pluralValue || `${singular}s`}`;
}

function displayPartNumber(item: WalkthroughItem): string {
  return (
    item.manufacturer_part_number ||
    item.vendor_part_number ||
    item.part_number ||
    ""
  );
}

function itemTitle(item: WalkthroughItem): string {
  return item.description || displayPartNumber(item) || "Inventory Item";
}

function formatConfidence(value: number): string {
  const normalized = value > 1 ? value / 100 : value;
  return `${Math.round(Math.max(0, Math.min(1, normalized)) * 100)}%`;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function WalkthroughDetailScreen() {
  const params = useLocalSearchParams<{ walkthroughId?: string; customerName?: string }>();
  const walkthroughId = Number(params.walkthroughId || 0);
  const fallbackCustomer = typeof params.customerName === "string" ? params.customerName : "Customer";
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const [viewerSize, setViewerSize] = useState({ width: windowWidth, height: Math.max(windowHeight - 120, 320) });
  const { width: viewerWidth, height: viewerHeight } = viewerSize;

  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedMetricView, setSelectedMetricView] = useState<MetricView>(null);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WalkthroughItem | null>(null);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewer | null>(null);

  const photoViewerScrollRef = useRef<ScrollView>(null);
  const lastPhotoViewerTapTime = useRef(0);
  const photoViewerIsZoomed = useRef(false);
  const pendingPhotoViewer = useRef<PhotoViewer | null>(null);

  const loadWalkthrough = useCallback(async (showLoading = true) => {
    if (!walkthroughId) {
      Alert.alert("Walkthrough unavailable", "The selected walkthrough could not be identified.");
      setIsLoading(false);
      return;
    }
    if (showLoading) setIsLoading(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/walkthroughs/${walkthroughId}`);
      const text = await response.text();
      let data: WalkthroughResponse;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("WalkthroughAI received an unexpected response.");
      }
      if (!response.ok || !data.success || !data.walkthrough) {
        throw new Error(data.error || "WalkthroughAI couldn’t load this walkthrough.");
      }
      setWalkthrough(data.walkthrough);
    } catch (error) {
      Alert.alert(
        "Unable to load walkthrough",
        error instanceof Error ? error.message : "WalkthroughAI couldn’t load this walkthrough."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [walkthroughId]);

  useEffect(() => {
    void loadWalkthrough();
  }, [loadWalkthrough]);

  const locationGroups = useMemo<LocationGroup[]>(() => {
    const map = new Map<string, WalkthroughItem[]>();
    for (const item of walkthrough?.items || []) {
      const location = item.location?.trim() || "Unassigned";
      map.set(location, [...(map.get(location) || []), item]);
    }
    return Array.from(map.entries())
      .map(([name, items]) => ({
        name,
        items,
        photoCount: new Set(items.map((item) => item.photo).filter(Boolean)).size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [walkthrough]);

  const [visibleCount, setVisibleCount] = useState(40);
  useEffect(() => setVisibleCount(40), [selectedLocation, selectedVendor]);
  const visibleItems = useMemo(() => {
    if (!walkthrough) return [];
    if (selectedLocation === "__ALL__") return walkthrough.items;
    if (!selectedLocation) return [];
    return walkthrough.items.filter(
      (item) => (item.location?.trim() || "Unassigned") === selectedLocation
    );
  }, [selectedLocation, walkthrough]);

  const photoGroups = useMemo<PhotoGroup[]>(() => {
    const map = new Map<string, PhotoGroup>();

    for (const item of walkthrough?.items || []) {
      const photoName = item.photo?.trim();
      if (!photoName) continue;

      const existing = map.get(photoName);
      if (existing) {
        existing.itemCount += 1;
      } else {
        map.set(photoName, {
          name: photoName,
          item,
          itemCount: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [walkthrough]);

  const vendorGroups = useMemo<VendorGroup[]>(() => {
    const map = new Map<string, WalkthroughItem[]>();

    for (const item of walkthrough?.items || []) {
      const vendorName = item.vendor?.trim();
      if (!vendorName) continue;
      map.set(vendorName, [...(map.get(vendorName) || []), item]);
    }

    return Array.from(map.entries())
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [walkthrough]);

  const vendorCount = vendorGroups.length;

  const selectedVendorItems = useMemo(() => {
    if (!selectedVendor) return [];
    return vendorGroups.find((group) => group.name === selectedVendor)?.items || [];
  }, [selectedVendor, vendorGroups]);

  async function downloadAndShareWorkbook() {
    if (!walkthrough || isSharing) return;
    setIsSharing(true);
    try {
      // Editing/re-exporting can replace the old workbook and invalidate cached links.
      const refresh = await apiFetch(`${API_BASE_URL}/api/walkthroughs/${walkthrough.id}`);
      const refreshed: WalkthroughResponse = await refresh.json();
      if (!refresh.ok || !refreshed.success || !refreshed.walkthrough) {
        throw new Error(refreshed.error || `Could not refresh report (${refresh.status}). Please try again.`);
      }
      const latest = refreshed.walkthrough;
      setWalkthrough(latest);
      if (!latest.download_url || !latest.workbook_file) throw new Error("This report does not have a saved workbook yet.");
      if (await downloadInBrowser(latest.download_url, latest.workbook_file)) return;
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing is not available on this device.");
      }
      const safeName = latest.workbook_file.replace(/[^a-zA-Z0-9._-]/g, "_");
      const localFileUri = `${FileSystem.cacheDirectory}${safeName}`;
      const result = await FileSystem.downloadAsync(latest.download_url, localFileUri);
      if (result.status < 200 || result.status >= 300) {
        await FileSystem.deleteAsync(localFileUri, { idempotent: true }).catch(() => {});
        throw new Error(result.status === 404 ? "The saved workbook is missing from the server. Your report items are still saved. (HTTP 404)" : result.status === 403 ? "The report download link was rejected. Please reopen the report and try again. (HTTP 403)" : `The workbook server returned HTTP ${result.status}. Please try again.`);
      }
      await Sharing.shareAsync(result.uri, {
        dialogTitle: "Share Walkthrough Workbook",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        UTI: "org.openxmlformats.spreadsheetml.sheet",
      });
    } catch (error) {
      Alert.alert(
        "Unable to share workbook",
        error instanceof Error ? error.message : "The workbook could not be shared."
      );
    } finally {
      setIsSharing(false);
    }
  }

  function openSourcePhoto(item: WalkthroughItem) {
    if (!item.photo_url) {
      Alert.alert("Source photo unavailable", "A saved source-photo link was not returned for this item.");
      return;
    }

    const nextPhotoViewer: PhotoViewer = {
      uri: item.photo_url,
      label: `${item.location?.trim() || "Unassigned"} · ${item.photo || "Source Photo"}`,
    };

    lastPhotoViewerTapTime.current = 0;
    photoViewerIsZoomed.current = false;

    if (selectedItem !== null) {
      pendingPhotoViewer.current = nextPhotoViewer;
      setSelectedItem(null);
      return;
    }

    setPhotoViewer(nextPhotoViewer);
  }

  function handlePartDetailsDismiss() {
    const queuedPhotoViewer = pendingPhotoViewer.current;

    if (!queuedPhotoViewer) {
      return;
    }

    pendingPhotoViewer.current = null;

    requestAnimationFrame(() => {
      setPhotoViewer(queuedPhotoViewer);
    });
  }

  function closePhotoViewer() {
    setPhotoViewer(null);
    lastPhotoViewerTapTime.current = 0;
    photoViewerIsZoomed.current = false;
  }

  function handlePhotoViewerTap() {
    const now = Date.now();
    const elapsed = now - lastPhotoViewerTapTime.current;
    lastPhotoViewerTapTime.current = now;
    if (elapsed <= 0 || elapsed > 320) return;
    lastPhotoViewerTapTime.current = 0;
    const shouldZoomIn = !photoViewerIsZoomed.current;
    const zoomScale = shouldZoomIn ? 2.5 : 1;
    const targetWidth = viewerWidth / zoomScale;
    const targetHeight = viewerHeight / zoomScale;
    photoViewerScrollRef.current?.scrollResponderZoomTo({
      x: shouldZoomIn ? (viewerWidth - targetWidth) / 2 : 0,
      y: shouldZoomIn ? (viewerHeight - targetHeight) / 2 : 0,
      width: targetWidth,
      height: targetHeight,
      animated: true,
    });
    photoViewerIsZoomed.current = shouldZoomIn;
  }

  const customerName = walkthrough?.customer_name || fallbackCustomer;
  const showingParts = selectedLocation !== null;
  const showingVendorItems = selectedMetricView === "vendors" && selectedVendor !== null;
  const showingMetricView = selectedMetricView !== null;

  const screenTitle = showingParts
    ? selectedLocation === "__ALL__"
      ? "All Inventory"
      : selectedLocation
    : showingVendorItems
      ? selectedVendor || "Vendor"
      : selectedMetricView === "photos"
        ? "Photos"
        : selectedMetricView === "areas"
          ? "Areas"
          : selectedMetricView === "vendors"
            ? "Vendors"
            : "Walkthrough Report";

  const headerSubtitle = showingParts || showingMetricView
    ? customerName
    : walkthrough
      ? `Walkthrough #${walkthrough.id}`
      : fallbackCustomer;

  function handleBackPress() {
    if (showingParts) {
      setSelectedLocation(null);
      return;
    }

    if (selectedVendor) {
      setSelectedVendor(null);
      return;
    }

    if (showingMetricView) {
      setSelectedMetricView(null);
      return;
    }

    router.back();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={handleBackPress}
            style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerText}>
            <Text numberOfLines={2} style={styles.title}>{screenTitle}</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{headerSubtitle}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#3B82F6" size="large" />
            <Text style={styles.loadingText}>Loading walkthrough…</Text>
          </View>
        ) : walkthrough ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                tintColor="#3B82F6"
                onRefresh={() => {
                  setIsRefreshing(true);
                  void loadWalkthrough(false);
                }}
              />
            }
          >
            {!showingParts && !showingMetricView ? (
              <>
                <View style={styles.reportHero}>
                  <View style={styles.reportHeroTop}>
                    <View style={styles.reportHeroText}>
                      <Text style={styles.reportEyebrow}>INVENTORY WALKTHROUGH</Text>
                      <Text style={styles.reportCustomer}>{customerName}</Text>
                      <Text style={styles.reportMeta}>
                        Walkthrough #{walkthrough.id} · {formatDate(walkthrough.completed_at)}
                      </Text>
                    </View>
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedBadgeText}>Completed</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.statGrid}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View all inventory parts"
                    onPress={() => setSelectedLocation("__ALL__")}
                    style={({ pressed }) => [styles.statCard, pressed && styles.statCardPressed]}
                  >
                    <View style={styles.statCardTop}>
                      <Ionicons name="cube-outline" size={21} color="#93C5FD" />
                      <Ionicons name="chevron-forward" size={17} color="#58708D" />
                    </View>
                    <Text style={styles.statValue}>{walkthrough.item_count}</Text>
                    <Text style={styles.statLabel}>Parts</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View walkthrough photos"
                    onPress={() => setSelectedMetricView("photos")}
                    style={({ pressed }) => [styles.statCard, pressed && styles.statCardPressed]}
                  >
                    <View style={styles.statCardTop}>
                      <Ionicons name="images-outline" size={21} color="#93C5FD" />
                      <Ionicons name="chevron-forward" size={17} color="#58708D" />
                    </View>
                    <Text style={styles.statValue}>{walkthrough.photo_count}</Text>
                    <Text style={styles.statLabel}>Photos</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View inventory areas"
                    onPress={() => setSelectedMetricView("areas")}
                    style={({ pressed }) => [styles.statCard, pressed && styles.statCardPressed]}
                  >
                    <View style={styles.statCardTop}>
                      <Ionicons name="location-outline" size={21} color="#93C5FD" />
                      <Ionicons name="chevron-forward" size={17} color="#58708D" />
                    </View>
                    <Text style={styles.statValue}>{locationGroups.length}</Text>
                    <Text style={styles.statLabel}>Areas</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View vendors"
                    onPress={() => setSelectedMetricView("vendors")}
                    style={({ pressed }) => [styles.statCard, pressed && styles.statCardPressed]}
                  >
                    <View style={styles.statCardTop}>
                      <Ionicons name="business-outline" size={21} color="#93C5FD" />
                      <Ionicons name="chevron-forward" size={17} color="#58708D" />
                    </View>
                    <Text style={styles.statValue}>{vendorCount}</Text>
                    <Text style={styles.statLabel}>Vendors</Text>
                  </Pressable>
                </View>

                <Text style={styles.sectionTitle}>Inventory by Area</Text>
                <View style={styles.locationList}>
                  {locationGroups.map((group) => (
                    <Pressable
                      key={group.name}
                      onPress={() => setSelectedLocation(group.name)}
                      style={({ pressed }) => [styles.locationRow, pressed && styles.buttonPressed]}
                    >
                      <View style={styles.locationIcon}>
                        <Ionicons name="location-outline" size={21} color="#93C5FD" />
                      </View>
                      <View style={styles.navigationText}>
                        <Text style={styles.navigationTitle}>{group.name}</Text>
                        <Text style={styles.navigationMeta}>
                          {plural(group.items.length, "part")} · {plural(group.photoCount, "photo")}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={22} color="#93C5FD" />
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>All Inventory</Text>
                <Pressable
                  onPress={() => setSelectedLocation("__ALL__")}
                  style={({ pressed }) => [styles.navigationCard, pressed && styles.buttonPressed]}
                >
                  <View style={styles.navigationIconPrimary}>
                    <Ionicons name="list" size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.navigationText}>
                    <Text style={styles.navigationTitle}>Complete Parts List</Text>
                    <Text style={styles.navigationMeta}>
                      {plural(walkthrough.item_count, "part")} across {plural(locationGroups.length, "area")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="#93C5FD" />
                </Pressable>

                <Text style={styles.sectionTitle}>Export</Text>
                <View style={styles.exportCard}>
                  <View style={styles.exportStatusRow}>
                    <Ionicons
                      name={walkthrough.email_sent ? "mail-outline" : "mail-unread-outline"}
                      size={17}
                      color={walkthrough.email_sent ? "#86EFAC" : "#94A3B8"}
                    />
                    <Text style={styles.exportStatusText}>
                      {walkthrough.email_sent
                        ? `Emailed${walkthrough.recipient_email ? ` to ${walkthrough.recipient_email}` : ""}`
                        : "Not emailed"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSharing || !walkthrough.download_url}
                    onPress={downloadAndShareWorkbook}
                    style={({ pressed }) => [
                      styles.shareButton,
                      pressed && styles.buttonPressed,
                      (isSharing || !walkthrough.download_url) && styles.disabled,
                    ]}
                  >
                    {isSharing ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.shareButtonText}>{Platform.OS === "web" ? "Download Excel" : "Open / Share Excel Report"}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            ) : selectedMetricView === "photos" ? (
              <>
                <View style={styles.metricSummary}>
                  <Text style={styles.metricSummaryValue}>{walkthrough.photo_count}</Text>
                  <View style={styles.metricSummaryText}>
                    <Text style={styles.metricSummaryTitle}>Source Photos</Text>
                    <Text style={styles.metricSummaryMeta}>
                      Tap a photo to open the original walkthrough image.
                    </Text>
                  </View>
                </View>

                <View style={styles.metricList}>
                  {photoGroups.map((group, index) => (
                    <Pressable
                      key={group.name}
                      accessibilityRole="button"
                      accessibilityLabel={`Open photo ${index + 1}, ${group.item.location?.trim() || "Unassigned"}`}
                      disabled={!group.item.photo_url}
                      onPress={() => openSourcePhoto(group.item)}
                      style={({ pressed }) => [
                        styles.metricRow,
                        !group.item.photo_url && styles.disabled,
                        pressed && group.item.photo_url && styles.buttonPressed,
                      ]}
                    >
                      <View style={styles.metricIcon}>
                        <Ionicons name="image-outline" size={21} color="#93C5FD" />
                      </View>
                      <View style={styles.navigationText}>
                        <Text numberOfLines={1} style={styles.navigationTitle}>Photo {index + 1}</Text>
                        <Text style={styles.navigationMeta}>
                          {plural(group.itemCount, "part")} · {group.item.location?.trim() || "Unassigned"}
                        </Text>
                      </View>
                      <Ionicons name="expand-outline" size={20} color="#93C5FD" />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : selectedMetricView === "areas" ? (
              <>
                <View style={styles.metricSummary}>
                  <Text style={styles.metricSummaryValue}>{locationGroups.length}</Text>
                  <View style={styles.metricSummaryText}>
                    <Text style={styles.metricSummaryTitle}>Inventory Areas</Text>
                    <Text style={styles.metricSummaryMeta}>
                      Choose an area to view its inventory.
                    </Text>
                  </View>
                </View>

                <View style={styles.locationList}>
                  {locationGroups.map((group) => (
                    <Pressable
                      key={group.name}
                      onPress={() => {
                        setSelectedMetricView(null);
                        setSelectedLocation(group.name);
                      }}
                      style={({ pressed }) => [styles.locationRow, pressed && styles.buttonPressed]}
                    >
                      <View style={styles.locationIcon}>
                        <Ionicons name="location-outline" size={21} color="#93C5FD" />
                      </View>
                      <View style={styles.navigationText}>
                        <Text style={styles.navigationTitle}>{group.name}</Text>
                        <Text style={styles.navigationMeta}>
                          {plural(group.items.length, "part")} · {plural(group.photoCount, "photo")}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={22} color="#93C5FD" />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : selectedMetricView === "vendors" && !selectedVendor ? (
              <>
                <View style={styles.metricSummary}>
                  <Text style={styles.metricSummaryValue}>{vendorCount}</Text>
                  <View style={styles.metricSummaryText}>
                    <Text style={styles.metricSummaryTitle}>Vendors</Text>
                    <Text style={styles.metricSummaryMeta}>
                      Choose a vendor to view the parts found in this walkthrough.
                    </Text>
                  </View>
                </View>

                {vendorGroups.length ? (
                  <View style={styles.metricList}>
                    {vendorGroups.map((group) => (
                      <Pressable
                        key={group.name}
                        onPress={() => setSelectedVendor(group.name)}
                        style={({ pressed }) => [styles.metricRow, pressed && styles.buttonPressed]}
                      >
                        <View style={styles.metricIcon}>
                          <Ionicons name="business-outline" size={21} color="#93C5FD" />
                        </View>
                        <View style={styles.navigationText}>
                          <Text style={styles.navigationTitle}>{group.name}</Text>
                          <Text style={styles.navigationMeta}>{plural(group.items.length, "part")}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={22} color="#93C5FD" />
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyMetricCard}>
                    <Ionicons name="business-outline" size={28} color="#52657D" />
                    <Text style={styles.emptyMetricTitle}>No vendor names identified</Text>
                    <Text style={styles.emptyMetricText}>
                      Parts without a vendor are still available in All Inventory.
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={styles.partsSummary}>
                  <Text style={styles.partsSummaryTitle}>
                    {selectedVendor
                      ? selectedVendor
                      : selectedLocation === "__ALL__"
                        ? "All Inventory"
                        : selectedLocation}
                  </Text>
                  <Text style={styles.partsSummaryMeta}>
                    {plural(
                      selectedVendor ? selectedVendorItems.length : visibleItems.length,
                      "part"
                    )} · {plural(
                      new Set(
                        (selectedVendor ? selectedVendorItems : visibleItems)
                          .map((item) => item.photo)
                          .filter(Boolean)
                      ).size,
                      "photo"
                    )}
                  </Text>
                </View>

                <View style={styles.partsList}>
                  {(selectedVendor ? selectedVendorItems : visibleItems).slice(0, visibleCount).map((item) => (
                    <View key={item.id} style={styles.partRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View details for ${itemTitle(item)}`}
                        onPress={() => setSelectedItem(item)}
                        style={({ pressed }) => [styles.partMain, pressed && styles.partPressed]}
                      >
                        <View style={styles.partNumberBadge}>
                          <Text style={styles.partNumberBadgeText}>{item.item_number}</Text>
                        </View>
                        <View style={styles.partText}>
                          <Text numberOfLines={2} style={styles.partTitle}>{itemTitle(item)}</Text>
                          {displayPartNumber(item) ? (
                            <Text numberOfLines={1} style={styles.partNumber}>{displayPartNumber(item)}</Text>
                          ) : null}
                          <Text numberOfLines={1} style={styles.partMeta}>
                            {[item.vendor, item.size_specification].filter(Boolean).join(" · ") || "No additional details"}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#6F829A" />
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View source photo for ${itemTitle(item)}`}
                        onPress={() => openSourcePhoto(item)}
                        style={({ pressed }) => [
                          styles.photoButton,
                          !item.photo_url && styles.photoButtonDisabled,
                          pressed && item.photo_url && styles.buttonPressed,
                        ]}
                      >
                        <Ionicons name="image-outline" size={22} color={item.photo_url ? "#93C5FD" : "#52657D"} />
                        <Text style={[styles.photoButtonText, !item.photo_url && styles.photoButtonTextDisabled]}>Photo</Text>
                      </Pressable>
                    </View>
                  ))}
                {(selectedVendor ? selectedVendorItems : visibleItems).length > visibleCount ? <Pressable accessibilityRole="button" onPress={() => setVisibleCount(count => count + 40)} style={{ padding: 18, backgroundColor: "#1b2c43", borderRadius: 12 }}><Text style={{ color: "#bfdbfe", textAlign: "center", fontWeight: "700" }}>Show 40 more products</Text></Pressable> : null}
</View>
              </>
            )}
          </ScrollView>
        ) : (
          <View style={styles.center}><Text style={styles.emptyText}>Walkthrough unavailable.</Text></View>
        )}
      </View>

      <Modal
        visible={selectedItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onDismiss={handlePartDetailsDismiss}
        onRequestClose={() => setSelectedItem(null)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSelectedItem(null)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Part Details</Text>
            <View style={styles.headerSpacer} />
          </View>
          {selectedItem ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <Text style={styles.itemDetailTitle}>{itemTitle(selectedItem)}</Text>
              {displayPartNumber(selectedItem) ? (
                <Text style={styles.itemDetailPartNumber}>{displayPartNumber(selectedItem)}</Text>
              ) : null}
              <View style={styles.itemDetailStatusRow}>
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>{formatConfidence(selectedItem.confidence)} confidence</Text>
                </View>
                <Text style={styles.confirmedText}>{selectedItem.is_confirmed ? "✓ Confirmed" : "Not confirmed"}</Text>
              </View>
              <SourcingSummary record={selectedItem.sourcing_recommendation} />
              <View style={styles.detailsCard}>
                <DetailRow label="Location" value={selectedItem.location || "Unassigned"} />
                <DetailRow label="Vendor" value={selectedItem.vendor} />
                <DetailRow label="Manufacturer" value={selectedItem.manufacturer} />
                <DetailRow label="Manufacturer Part #" value={selectedItem.manufacturer_part_number} />
                <DetailRow label="Vendor Part #" value={selectedItem.vendor_part_number} />
                <DetailRow label="Observed Part # (unclassified)" value={selectedItem.part_number} />
                <DetailRow label="Customer Part #" value={selectedItem.customer_part_number} />
                <DetailRow label="Fastenal Item #" value={selectedItem.fastenal_part_number} />
                <DetailRow label="Reviewed By" value={selectedItem.reviewed_by} />
                <DetailRow label="Reviewed At" value={selectedItem.reviewed_at} />
                {selectedItem.review_history?.map((event, index) => <DetailRow key={index} label={`${event.event} · ${event.at}`} value={event.by} />)}
                <DetailRow label="Size / Specification" value={selectedItem.size_specification} />
                <DetailRow label="Package Quantity" value={selectedItem.package_quantity} />
                <DetailRow label="Notes" value={selectedItem.notes} />
              </View>
              <Pressable
                disabled={!selectedItem.photo_url}
                onPress={() => openSourcePhoto(selectedItem)}
                style={({ pressed }) => [styles.viewPhotoButton, !selectedItem.photo_url && styles.disabled, pressed && styles.buttonPressed]}
              >
                <Ionicons name="image-outline" size={22} color="#FFFFFF" />
                <Text style={styles.viewPhotoButtonText}>View Source Photo</Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={photoViewer !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        onDismiss={closePhotoViewer}
        onRequestClose={closePhotoViewer}
      >
        <View style={[styles.viewerSafeArea, { paddingBottom: safeAreaInsets.bottom }]}>
          <View style={[styles.viewerHeader, { minHeight: 68 + safeAreaInsets.top, paddingTop: safeAreaInsets.top }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close source photo" onPress={closePhotoViewer} style={styles.viewerCloseButton}>
              <Text style={styles.viewerCloseText}>Close</Text>
            </Pressable>
            <View style={styles.viewerTitleArea}>
              <Text numberOfLines={1} style={styles.viewerTitle}>{photoViewer?.label || "Source Photo"}</Text>
              <Text style={styles.viewerHint}>Swipe photos · pinch to zoom</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fit source photo to screen" style={styles.viewerCloseButton} onPress={() => {
              photoViewerScrollRef.current?.scrollResponderZoomTo({ x: 0, y: 0, width: viewerWidth, height: viewerHeight, animated: true });
              photoViewerIsZoomed.current = false;
            }}><Text style={styles.viewerCloseText}>Fit</Text></Pressable>
          </View>
          {photoViewer ? (
            <PhotoNavigation photos={(walkthrough?.items || []).filter(item => item.photo_url).map(item => ({ uri: item.photo_url!, label: `${item.location?.trim() || "Unassigned"} · ${item.photo || "Source Photo"}` }))} current={photoViewer} isZoomed={photoViewerIsZoomed} onSelect={photo => { lastPhotoViewerTapTime.current = 0; photoViewerIsZoomed.current = false; setPhotoViewer(photo); }}>
<ScrollView
              ref={photoViewerScrollRef}
              key={photoViewer.uri}
              onLayout={({ nativeEvent: { layout } }) => {
                if (layout.width > 0 && layout.height > 0) setViewerSize(current => current.width === layout.width && current.height === layout.height ? current : { width: layout.width, height: layout.height });
              }}
              style={styles.viewerScroll}
              contentContainerStyle={styles.viewerContent}
              centerContent
              minimumZoomScale={1}
              maximumZoomScale={5}
              onScroll={(event) => {
                const zoomScale = event.nativeEvent.zoomScale;
                if (typeof zoomScale === "number") photoViewerIsZoomed.current = zoomScale > 1.1;
              }}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={handlePhotoViewerTap} style={{ width: viewerWidth, height: viewerHeight }}>
                <Image source={{ uri: photoViewer.uri }} resizeMode="contain" style={styles.viewerImage} />
              </Pressable>
            </ScrollView>
</PhotoNavigation>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#091321" },
  container: { width: "100%", maxWidth: 1180, alignSelf: "center", flex: 1, paddingHorizontal: UI.screenPadding, paddingTop: 10 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backButton: { width: UI.navigationSize, minHeight: 48, borderRadius: UI.cardRadius, backgroundColor: "#17243A", borderWidth: 1, borderColor: "#31547D", alignItems: "center", justifyContent: "center", marginRight: 13 },
  headerText: {minWidth: 0,  flex: 1 },
  title: {flexShrink: 1,  color: "#FFFFFF", fontSize: UI.pageTitle, fontWeight: "800" },
  subtitle: { color: "#94A3B8", fontSize: 14, marginTop: 3 },
  content: { paddingBottom: 72 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#94A3B8", marginTop: 12 },
  emptyText: { color: "#94A3B8" },
  summaryCard: { backgroundColor: "#17283D", borderRadius: UI.cardRadius, borderWidth: 1, borderColor: "#31547D", padding: UI.cardPadding, marginBottom: 22 },
  summaryTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  summaryTitleWrap: { flex: 1, paddingRight: 12 },
  summaryTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  summaryDate: { color: "#94A3B8", fontSize: 13, marginTop: 5 },
  completedBadge: { backgroundColor: "#123C2C", borderWidth: 1, borderColor: "#1F6B4D", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  completedBadgeText: { color: "#86EFAC", fontSize: 12, fontWeight: "800" },
  summaryStats: { color: "#BFDBFE", fontSize: 14, fontWeight: "700", marginTop: 17 },
  emailStatusRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  emailStatus: { color: "#94A3B8", fontSize: 12 },
  shareButton: { minHeight: UI.controlHeight, borderRadius: UI.cardRadius, backgroundColor: "#2D6BF0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 },
  shareButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  sectionTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 10 },
  navigationCard: { minHeight: 76, flexDirection: "row", alignItems: "center", borderRadius: UI.cardRadius, backgroundColor: "#122033", borderWidth: 1, borderColor: "#2B3E56", paddingHorizontal: 14, marginBottom: 18 },
  navigationIconPrimary: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#2D6BF0", alignItems: "center", justifyContent: "center", marginRight: 12 },
  navigationText: { flex: 1 },
  navigationTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  navigationMeta: { color: "#8294AA", fontSize: 12, marginTop: 4 },
  locationList: { borderRadius: 18, backgroundColor: "#122033", borderWidth: 1, borderColor: "#2B3E56", overflow: "hidden" },
  locationRow: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#2B3E56" },
  locationIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#16283D", alignItems: "center", justifyContent: "center", marginRight: 12 },
  partsSummary: { borderRadius: 17, backgroundColor: "#17283D", borderWidth: 1, borderColor: "#31547D", padding: 15, marginBottom: 14 },
  partsSummaryTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  partsSummaryMeta: { color: "#BFDBFE", fontSize: 12, marginTop: 5 },
  partsList: { gap: 11 },
  partRow: { borderRadius: 17, backgroundColor: "#122033", borderWidth: 1, borderColor: "#2B3E56", overflow: "hidden" },
  partMain: { minHeight: 68, flexDirection: "row", alignItems: "center", padding: 13 },
  partPressed: { opacity: 0.78 },
  partNumberBadge: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#2D6BF0", alignItems: "center", justifyContent: "center", marginRight: 11 },
  partNumberBadgeText: { color: "#FFFFFF", fontWeight: "800" },
  partText: { flex: 1, paddingRight: 8 },
  partTitle: { color: "#FFFFFF", fontSize: 15, lineHeight: 20, fontWeight: "800" },
  partNumber: { color: "#93C5FD", fontSize: 13, fontWeight: "700", marginTop: 4 },
  partMeta: { color: "#8294AA", fontSize: 12, marginTop: 4 },
  photoButton: { minHeight: 46, borderTopWidth: 1, borderTopColor: "#2B3E56", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#101B2C" },
  photoButtonDisabled: { opacity: 0.6 },
  photoButtonText: { color: "#BFDBFE", fontSize: 13, fontWeight: "800" },
  photoButtonTextDisabled: { color: "#52657D" },
  disabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  modalSafeArea: { flex: 1, backgroundColor: "#091321" },
  modalHeader: { minHeight: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#26384E", paddingHorizontal: 16 },
  closeButton: { width: 72, minHeight: 40, justifyContent: "center" },
  closeButtonText: { color: "#93C5FD", fontSize: 14, fontWeight: "700" },
  modalTitle: { flex: 1, color: "#FFFFFF", fontSize: 17, fontWeight: "800", textAlign: "center" },
  headerSpacer: { width: 72 },
  modalContent: { padding: 20, paddingBottom: 40 },
  itemDetailTitle: { color: "#FFFFFF", fontSize: UI.pageTitle, lineHeight: 30, fontWeight: "800" },
  itemDetailPartNumber: { color: "#93C5FD", fontSize: 17, fontWeight: "700", marginTop: 7 },
  itemDetailStatusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 16 },
  confidenceBadge: { borderRadius: 999, backgroundColor: "#10253A", paddingHorizontal: 11, paddingVertical: 7 },
  confidenceText: { color: "#A7F3D0", fontSize: 12, fontWeight: "800" },
  confirmedText: { color: "#86EFAC", fontSize: 12, fontWeight: "800" },
  detailsCard: { borderRadius: UI.cardRadius, backgroundColor: "#122033", borderWidth: 1, borderColor: "#2B3E56", padding: UI.cardPadding },
  detailRow: { marginBottom: 14 },
  detailLabel: { color: "#94A8C0", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  detailValue: { color: "#D8E2F0", fontSize: 15, lineHeight: 21 },
  viewPhotoButton: { minHeight: UI.controlHeight, borderRadius: UI.cardRadius, backgroundColor: "#2D6BF0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 15 },
  viewPhotoButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  reportHero: { backgroundColor: "#17283D", borderRadius: UI.cardRadius, borderWidth: 1, borderColor: "#31547D", padding: UI.cardPadding, marginBottom: 12 },
  reportHeroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  reportHeroText: { flex: 1, paddingRight: 12 },
  reportEyebrow: { color: "#7DA9D8", fontSize: 12, fontWeight: "900", letterSpacing: 1.1, marginBottom: 6 },
  reportCustomer: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  reportMeta: { color: "#94A3B8", fontSize: 12, marginTop: 6, lineHeight: 17 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  statCard: { width: "48%", minHeight: 68, borderRadius: UI.cardRadius, backgroundColor: "#122033", borderWidth: 1, borderColor: "#2B3E56", padding: UI.cardPadding, justifyContent: "space-between" },
  statCardPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  statCardTop: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statValue: { color: "#FFFFFF", fontSize: UI.metricValue, lineHeight: 24, paddingRight: 40, fontWeight: "700", marginTop: 0 },
  statLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "700", marginTop: 2 },
  sectionTitleSpaced: { marginTop: 20 },
  metricSummary: { flexDirection: "row", alignItems: "center", borderRadius: 18, backgroundColor: "#17283D", borderWidth: 1, borderColor: "#31547D", padding: 16, marginBottom: 14 },
  metricSummaryValue: { minWidth: 54, color: "#FFFFFF", fontSize: UI.metricValue, fontWeight: "900", marginRight: 14 },
  metricSummaryText: { flex: 1 },
  metricSummaryTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  metricSummaryMeta: { color: "#94A3B8", fontSize: 12, lineHeight: 17, marginTop: 4 },
  metricList: { gap: 10 },
  metricRow: { minHeight: 72, flexDirection: "row", alignItems: "center", borderRadius: 17, backgroundColor: "#122033", borderWidth: 1, borderColor: "#2B3E56", paddingHorizontal: 14 },
  metricIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#16283D", alignItems: "center", justifyContent: "center", marginRight: 12 },
  emptyMetricCard: { alignItems: "center", borderRadius: 18, backgroundColor: "#122033", borderWidth: 1, borderColor: "#2B3E56", padding: 24 },
  emptyMetricTitle: { color: "#D8E2F0", fontSize: 15, fontWeight: "800", marginTop: 10 },
  emptyMetricText: { color: "#8294AA", fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 5 },

  exportCard: { borderRadius: UI.cardRadius, backgroundColor: "#122033", borderWidth: 1, borderColor: "#2B3E56", padding: UI.cardPadding, marginBottom: 4 },
  exportStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  exportStatusText: { color: "#94A3B8", fontSize: 12, flex: 1 },
  viewerSafeArea: { flex: 1, backgroundColor: "#02070D" },
  viewerHeader: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#26384E", paddingHorizontal: 14 },
  viewerCloseButton: { width: 70, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#17283C" },
  viewerCloseText: { color: "#BFD5EA", fontSize: 13, fontWeight: "900" },
  viewerTitleArea: { flex: 1, alignItems: "center", paddingHorizontal: 10 },
  viewerTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  viewerHint: { color: "#AABBD0", fontSize: 12, marginTop: 2 },
  viewerSpacer: { width: 70 },
  viewerScroll: { flex: 1 },
  viewerContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
});
