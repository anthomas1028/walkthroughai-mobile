import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
  const viewerHeight = Math.max(windowHeight - 120, 320);

  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WalkthroughItem | null>(null);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewer | null>(null);

  const photoViewerScrollRef = useRef<ScrollView>(null);
  const lastPhotoViewerTapTime = useRef(0);
  const photoViewerIsZoomed = useRef(false);

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

  const visibleItems = useMemo(() => {
    if (!walkthrough) return [];
    if (selectedLocation === "__ALL__") return walkthrough.items;
    if (!selectedLocation) return [];
    return walkthrough.items.filter(
      (item) => (item.location?.trim() || "Unassigned") === selectedLocation
    );
  }, [selectedLocation, walkthrough]);

  async function downloadAndShareWorkbook() {
    if (!walkthrough?.download_url || !walkthrough.workbook_file) {
      Alert.alert("Workbook unavailable", "This walkthrough does not have a saved workbook link.");
      return;
    }
    setIsSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing is not available on this device.");
      }
      const safeName = walkthrough.workbook_file.replace(/[^a-zA-Z0-9._-]/g, "_");
      const localFileUri = `${FileSystem.cacheDirectory}${safeName}`;
      const result = await FileSystem.downloadAsync(walkthrough.download_url, localFileUri);
      if (result.status < 200 || result.status >= 300) {
        throw new Error("The workbook could not be downloaded.");
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
    setPhotoViewer({
      uri: item.photo_url,
      label: `${item.location?.trim() || "Unassigned"} · ${item.photo || "Source Photo"}`,
    });
    lastPhotoViewerTapTime.current = 0;
    photoViewerIsZoomed.current = false;
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
    const targetWidth = windowWidth / zoomScale;
    const targetHeight = viewerHeight / zoomScale;
    photoViewerScrollRef.current?.scrollResponderZoomTo({
      x: shouldZoomIn ? (windowWidth - targetWidth) / 2 : 0,
      y: shouldZoomIn ? (viewerHeight - targetHeight) / 2 : 0,
      width: targetWidth,
      height: targetHeight,
      animated: true,
    });
    photoViewerIsZoomed.current = shouldZoomIn;
  }

  const customerName = walkthrough?.customer_name || fallbackCustomer;
  const showingParts = selectedLocation !== null;
  const screenTitle = showingParts
    ? selectedLocation === "__ALL__"
      ? "All Parts"
      : selectedLocation
    : "Walkthrough Details";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => showingParts ? setSelectedLocation(null) : router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.title}>{screenTitle}</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{customerName}</Text>
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
            {!showingParts ? (
              <>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryTopRow}>
                    <View style={styles.summaryTitleWrap}>
                      <Text style={styles.summaryTitle}>Walkthrough #{walkthrough.id}</Text>
                      <Text style={styles.summaryDate}>{formatDate(walkthrough.completed_at)}</Text>
                    </View>
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedBadgeText}>Completed</Text>
                    </View>
                  </View>

                  <Text style={styles.summaryStats}>
                    {plural(locationGroups.length, "area")} · {plural(walkthrough.photo_count, "photo")} · {plural(walkthrough.item_count, "part")}
                  </Text>
                  <View style={styles.emailStatusRow}>
                    <Ionicons
                      name={walkthrough.email_sent ? "mail-outline" : "mail-unread-outline"}
                      size={16}
                      color={walkthrough.email_sent ? "#86EFAC" : "#94A3B8"}
                    />
                    <Text style={styles.emailStatus}>
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
                        <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.shareButtonText}>Open / Share Workbook</Text>
                      </>
                    )}
                  </Pressable>
                </View>

                <Text style={styles.sectionTitle}>Walkthrough Contents</Text>

                <Pressable
                  onPress={() => setSelectedLocation("__ALL__")}
                  style={({ pressed }) => [styles.navigationCard, pressed && styles.buttonPressed]}
                >
                  <View style={styles.navigationIconPrimary}>
                    <Ionicons name="list" size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.navigationText}>
                    <Text style={styles.navigationTitle}>All Parts</Text>
                    <Text style={styles.navigationMeta}>
                      {plural(walkthrough.item_count, "part")} across {plural(locationGroups.length, "area")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="#93C5FD" />
                </Pressable>

                <Text style={styles.sectionTitle}>Locations</Text>
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
              </>
            ) : (
              <>
                <View style={styles.partsSummary}>
                  <Text style={styles.partsSummaryTitle}>
                    {selectedLocation === "__ALL__" ? "Complete Parts List" : selectedLocation}
                  </Text>
                  <Text style={styles.partsSummaryMeta}>
                    {plural(visibleItems.length, "part")} · {plural(new Set(visibleItems.map((item) => item.photo).filter(Boolean)).size, "photo")}
                  </Text>
                </View>

                <View style={styles.partsList}>
                  {visibleItems.map((item) => (
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
              <View style={styles.detailsCard}>
                <DetailRow label="Location" value={selectedItem.location || "Unassigned"} />
                <DetailRow label="Vendor" value={selectedItem.vendor} />
                <DetailRow label="Manufacturer" value={selectedItem.manufacturer} />
                <DetailRow label="Manufacturer Part #" value={selectedItem.manufacturer_part_number} />
                <DetailRow label="Vendor Part #" value={selectedItem.vendor_part_number} />
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
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onDismiss={closePhotoViewer}
        onRequestClose={closePhotoViewer}
      >
        <View style={styles.viewerSafeArea}>
          <View style={[styles.viewerHeader, { minHeight: 68 + safeAreaInsets.top, paddingTop: safeAreaInsets.top }]}>
            <Pressable onPress={closePhotoViewer} style={styles.viewerCloseButton}>
              <Text style={styles.viewerCloseText}>Close</Text>
            </Pressable>
            <View style={styles.viewerTitleArea}>
              <Text numberOfLines={1} style={styles.viewerTitle}>{photoViewer?.label || "Source Photo"}</Text>
              <Text style={styles.viewerHint}>Pinch or double-tap to zoom</Text>
            </View>
            <View style={styles.viewerSpacer} />
          </View>
          {photoViewer ? (
            <ScrollView
              ref={photoViewerScrollRef}
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
              <Pressable onPress={handlePhotoViewerTap} style={{ width: windowWidth, height: viewerHeight }}>
                <Image source={{ uri: photoViewer.uri }} resizeMode="contain" style={styles.viewerImage} />
              </Pressable>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0B1220" },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 14 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  backButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#17243A", borderWidth: 1, borderColor: "#31547D", alignItems: "center", justifyContent: "center", marginRight: 13 },
  headerText: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#94A3B8", fontSize: 14, marginTop: 3 },
  content: { paddingBottom: 34 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#94A3B8", marginTop: 12 },
  emptyText: { color: "#94A3B8" },
  summaryCard: { backgroundColor: "#14243A", borderRadius: 20, borderWidth: 1, borderColor: "#31547D", padding: 17, marginBottom: 22 },
  summaryTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  summaryTitleWrap: { flex: 1, paddingRight: 12 },
  summaryTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  summaryDate: { color: "#94A3B8", fontSize: 13, marginTop: 5 },
  completedBadge: { backgroundColor: "#123C2C", borderWidth: 1, borderColor: "#1F6B4D", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  completedBadgeText: { color: "#86EFAC", fontSize: 12, fontWeight: "800" },
  summaryStats: { color: "#BFDBFE", fontSize: 14, fontWeight: "700", marginTop: 17 },
  emailStatusRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  emailStatus: { color: "#94A3B8", fontSize: 12 },
  shareButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#2563EB", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 17 },
  shareButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  sectionTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", marginBottom: 11 },
  navigationCard: { minHeight: 78, flexDirection: "row", alignItems: "center", borderRadius: 18, backgroundColor: "#121C2D", borderWidth: 1, borderColor: "#26364F", paddingHorizontal: 14, marginBottom: 22 },
  navigationIconPrimary: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center", marginRight: 12 },
  navigationText: { flex: 1 },
  navigationTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  navigationMeta: { color: "#8294AA", fontSize: 12, marginTop: 4 },
  locationList: { borderRadius: 18, backgroundColor: "#121C2D", borderWidth: 1, borderColor: "#26364F", overflow: "hidden" },
  locationRow: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#26364F" },
  locationIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#16283D", alignItems: "center", justifyContent: "center", marginRight: 12 },
  partsSummary: { borderRadius: 17, backgroundColor: "#14243A", borderWidth: 1, borderColor: "#31547D", padding: 15, marginBottom: 14 },
  partsSummaryTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  partsSummaryMeta: { color: "#BFDBFE", fontSize: 12, marginTop: 5 },
  partsList: { gap: 11 },
  partRow: { borderRadius: 17, backgroundColor: "#121C2D", borderWidth: 1, borderColor: "#26364F", overflow: "hidden" },
  partMain: { minHeight: 92, flexDirection: "row", alignItems: "center", padding: 13 },
  partPressed: { opacity: 0.78 },
  partNumberBadge: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#1D4ED8", alignItems: "center", justifyContent: "center", marginRight: 11 },
  partNumberBadgeText: { color: "#FFFFFF", fontWeight: "800" },
  partText: { flex: 1, paddingRight: 8 },
  partTitle: { color: "#FFFFFF", fontSize: 15, lineHeight: 20, fontWeight: "800" },
  partNumber: { color: "#93C5FD", fontSize: 13, fontWeight: "700", marginTop: 4 },
  partMeta: { color: "#8294AA", fontSize: 11, marginTop: 4 },
  photoButton: { minHeight: 46, borderTopWidth: 1, borderTopColor: "#26364F", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#101B2C" },
  photoButtonDisabled: { opacity: 0.6 },
  photoButtonText: { color: "#BFDBFE", fontSize: 13, fontWeight: "800" },
  photoButtonTextDisabled: { color: "#52657D" },
  disabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  modalSafeArea: { flex: 1, backgroundColor: "#0B1220" },
  modalHeader: { minHeight: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1C2D43", paddingHorizontal: 16 },
  closeButton: { width: 72, minHeight: 40, justifyContent: "center" },
  closeButtonText: { color: "#93C5FD", fontSize: 14, fontWeight: "700" },
  modalTitle: { flex: 1, color: "#FFFFFF", fontSize: 17, fontWeight: "800", textAlign: "center" },
  headerSpacer: { width: 72 },
  modalContent: { padding: 20, paddingBottom: 40 },
  itemDetailTitle: { color: "#FFFFFF", fontSize: 23, lineHeight: 30, fontWeight: "800" },
  itemDetailPartNumber: { color: "#93C5FD", fontSize: 17, fontWeight: "700", marginTop: 7 },
  itemDetailStatusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 16 },
  confidenceBadge: { borderRadius: 999, backgroundColor: "#10253A", paddingHorizontal: 11, paddingVertical: 7 },
  confidenceText: { color: "#A7F3D0", fontSize: 12, fontWeight: "800" },
  confirmedText: { color: "#86EFAC", fontSize: 12, fontWeight: "800" },
  detailsCard: { borderRadius: 18, backgroundColor: "#121C2D", borderWidth: 1, borderColor: "#26364F", padding: 16 },
  detailRow: { marginBottom: 14 },
  detailLabel: { color: "#718096", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  detailValue: { color: "#D8E2F0", fontSize: 15, lineHeight: 21 },
  viewPhotoButton: { minHeight: 54, borderRadius: 16, backgroundColor: "#2563EB", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 15 },
  viewPhotoButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  viewerSafeArea: { flex: 1, backgroundColor: "#02070D" },
  viewerHeader: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1C2D43", paddingHorizontal: 14 },
  viewerCloseButton: { width: 70, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#17283C" },
  viewerCloseText: { color: "#BFD5EA", fontSize: 13, fontWeight: "900" },
  viewerTitleArea: { flex: 1, alignItems: "center", paddingHorizontal: 10 },
  viewerTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  viewerHint: { color: "#71849D", fontSize: 10, marginTop: 2 },
  viewerSpacer: { width: 70 },
  viewerScroll: { flex: 1 },
  viewerContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
});
