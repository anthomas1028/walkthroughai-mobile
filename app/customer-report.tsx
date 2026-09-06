import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL, apiFetch } from "../lib/api";


type Customer = {
  id: number;
  company_name: string;
  logo_url?: string | null;
};

type ReportRecord = {
  id?: number;
  walkthrough_id?: number;
  item_number?: number;
  status?: string;
  is_archived?: boolean;
  walkthrough_is_archived?: boolean;
  item_count?: number;
  photo_count?: number;
  review_item_count?: number;
  walkthrough_count?: number;
  completed_at?: string;
  walkthrough_completed_at?: string;
  last_seen_at?: string;
  photo?: string | null;
  vendor?: string | null;
  manufacturer?: string | null;
  manufacturer_part_number?: string | null;
  vendor_part_number?: string | null;
  part_number?: string | null;
  description?: string | null;
  size_specification?: string | null;
  package_quantity?: string | null;
  label_text?: string | null;
  notes?: string | null;
  confidence?: number;
  review_needed?: boolean;
  is_confirmed?: boolean;
  was_edited?: boolean;
  email_sent?: boolean;
  location?: string | null;
  locations?: string[];
  vendors?: string[] | string | null;
  walkthrough_ids?: number[];
  appearance_count?: number;
  location_count?: number;
  photo_url?: string | null;
};

type CustomerReport = {
  customer: Customer;
  report_type: string;
  report_title: string;
  record_count: number;
  records: ReportRecord[];
  available_vendors?: string[];
  available_areas?: string[];
};

type ReportResponse = {
  success: boolean;
  report?: CustomerReport;
  error?: string;
  details?: string;
};

type ExportResponse = {
  success: boolean;
  workbook_file?: string;
  download_url?: string;
  error?: string;
  details?: string;
};

type ReviewItemMutationResponse = {
  success: boolean;
  item?: ReportRecord;
  deleted_item_id?: number;
  walkthrough_id?: number;
  download_url?: string;
  message?: string;
  error?: string;
  details?: string;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name_asc", label: "A–Z" },
  { value: "count_desc", label: "Most Items" },
];

const DATE_OPTIONS = [
  { value: 0, label: "All Dates" },
  { value: 30, label: "30 Days" },
  { value: 90, label: "90 Days" },
  { value: 365, label: "1 Year" },
];

function singleParam(
  value: string | string[] | undefined
): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseBackendDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const cleaned = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  const parsed = new Date(hasTimezone ? cleaned : `${cleaned}Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: string): string {
  const parsed = parseBackendDate(value);

  if (!parsed) {
    return "Date unavailable";
  }

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function confidenceText(value?: number): string {
  const numeric = Number(value) || 0;
  const normalized = numeric > 1 ? numeric : numeric * 100;
  return `${Math.round(normalized)}%`;
}

function buildQuery(
  reportType: string,
  vendor: string,
  area: string,
  search: string,
  sort: string,
  days: number
): string {
  const query = new URLSearchParams({
    report_type: reportType,
    sort,
    days: String(days),
  });

  if (vendor) {
    query.set("vendor", vendor);
  }

  if (area) {
    query.set("area", area);
  }

  if (search.trim()) {
    query.set("search", search.trim());
  }

  return query.toString();
}

export default function CustomerReportScreen() {
  const params = useLocalSearchParams<{
    customerId?: string;
    customerName?: string;
    reportType?: string;
    vendor?: string;
  }>();

  const customerId = Number(singleParam(params.customerId) || 0);
  const fallbackCustomerName =
    singleParam(params.customerName) || "Customer";
  const reportType =
    singleParam(params.reportType) || "walkthroughs";
  const selectedVendor = singleParam(params.vendor);
  const isUniquePartsReport = reportType === "inventory";
  const isReviewReport = reportType === "review";
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const viewerHeight = Math.max(windowHeight - 120, 320);

  const [report, setReport] = useState<CustomerReport | null>(null);
  const [customerLogoUrl, setCustomerLogoUrl] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [days, setDays] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [inventoryVendor, setInventoryVendor] = useState(
    isUniquePartsReport ? selectedVendor : ""
  );
  const [inventoryArea, setInventoryArea] = useState("");
  const [draftInventoryVendor, setDraftInventoryVendor] = useState(
    isUniquePartsReport ? selectedVendor : ""
  );
  const [draftInventoryArea, setDraftInventoryArea] = useState("");
  const [availableInventoryVendors, setAvailableInventoryVendors] = useState<string[]>([]);
  const [availableInventoryAreas, setAvailableInventoryAreas] = useState<string[]>([]);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedPart, setSelectedPart] = useState<ReportRecord | null>(null);
  const [selectedReviewItem, setSelectedReviewItem] = useState<ReportRecord | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReportRecord | null>(null);
  const [isSavingReviewItem, setIsSavingReviewItem] = useState(false);
  const [isRemovingReviewItem, setIsRemovingReviewItem] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<{ uri: string; label: string } | null>(null);
  const photoViewerScrollRef = useRef<ScrollView>(null);
  const lastPhotoViewerTapTime = useRef(0);
  const photoViewerIsZoomed = useRef(false);

  const loadReport = useCallback(
    async (showLoading: boolean = true) => {
      if (!customerId) {
        Alert.alert(
          "Customer unavailable",
          "The selected customer could not be identified."
        );
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const query = buildQuery(
          reportType,
          isUniquePartsReport ? inventoryVendor : selectedVendor,
          isUniquePartsReport ? inventoryArea : "",
          appliedSearch,
          sort,
          days
        );
        const response = await apiFetch(
          `${API_BASE_URL}/api/customers/${customerId}/report?${query}`
        );
        const text = await response.text();
        let data: ReportResponse;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("The server returned an unreadable report.");
        }

        if (!response.ok || !data.success || !data.report) {
          throw new Error(
            data.error || data.details || "The report could not be loaded."
          );
        }

        setReport(data.report);

        try {
          const customerResponse = await apiFetch(
            `${API_BASE_URL}/api/customers/${customerId}`
          );

          if (customerResponse.ok) {
            const customerData = await customerResponse.json();

            if (customerData?.success && customerData?.customer) {
              setCustomerLogoUrl(customerData.customer.logo_url || "");
            }
          }
        } catch {
          setCustomerLogoUrl("");
        }

        if (isUniquePartsReport) {
          setAvailableInventoryVendors((current) =>
            Array.from(new Set([...current, ...(data.report?.available_vendors || [])]))
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
          );
          setAvailableInventoryAreas((current) =>
            Array.from(new Set([...current, ...(data.report?.available_areas || [])]))
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
          );
        }
      } catch (error) {
        Alert.alert(
          "Unable to load report",
          error instanceof Error
            ? error.message
            : "The report could not be loaded."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }, [
      appliedSearch,
      customerId,
      days,
      reportType,
      selectedVendor,
      inventoryVendor,
      inventoryArea,
      isUniquePartsReport,
      sort,
    ]
  );

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  function openWalkthrough(record: ReportRecord) {
    const walkthroughId = record.id || record.walkthrough_id;

    if (!walkthroughId) {
      return;
    }

    router.push({
      pathname: "/walkthrough-detail",
      params: {
        walkthroughId: String(walkthroughId),
        customerName:
          report?.customer.company_name || fallbackCustomerName,
      },
    });
  }

  function openVendor(vendor: string) {
    router.push({
      pathname: "/customer-report",
      params: {
        customerId: String(customerId),
        customerName:
          report?.customer.company_name || fallbackCustomerName,
        reportType: "vendor",
        vendor,
      },
    });
  }

  async function exportReport() {
    setIsExporting(true);

    try {
      const query = buildQuery(
        reportType,
        isUniquePartsReport ? inventoryVendor : selectedVendor,
        isUniquePartsReport ? inventoryArea : "",
        appliedSearch,
        sort,
        days
      );
      const response = await apiFetch(
        `${API_BASE_URL}/api/customers/${customerId}/report/export?${query}`
      );
      const text = await response.text();
      let data: ExportResponse;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("The server returned an unreadable export response.");
      }

      if (
        !response.ok ||
        !data.success ||
        !data.download_url ||
        !data.workbook_file
      ) {
        throw new Error(
          data.error || data.details || "The Excel report could not be created."
        );
      }

      const sharingAvailable = await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        throw new Error("Sharing is not available on this device.");
      }

      const safeFileName = data.workbook_file.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );
      const localUri = `${FileSystem.cacheDirectory}${safeFileName}`;
      const download = await FileSystem.downloadAsync(
        data.download_url,
        localUri
      );

      if (download.status < 200 || download.status >= 300) {
        throw new Error("The Excel report could not be downloaded.");
      }

      await Sharing.shareAsync(download.uri, {
        dialogTitle: "Share Customer Report",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        UTI: "org.openxmlformats.spreadsheetml.sheet",
      });
    } catch (error) {
      Alert.alert(
        "Unable to export report",
        error instanceof Error
          ? error.message
          : "The Excel report could not be exported."
      );
    } finally {
      setIsExporting(false);
    }
  }

  function recordDate(record: ReportRecord): string | undefined {
    return (
      record.completed_at ||
      record.walkthrough_completed_at ||
      record.last_seen_at
    );
  }

  function photoDisplayLabel(photoName?: string | null): string {
    const cleanedPhotoName = (photoName || "").trim();
    const numberedPhoto = cleanedPhotoName.match(
      /(?:^|[^a-z])photo[_\s-]*(\d+)/i
    );

    if (numberedPhoto) {
      return `Photo ${Number.parseInt(numberedPhoto[1], 10)}`;
    }

    return cleanedPhotoName || "Inventory Photo";
  }

  function openPartPhoto(item: ReportRecord) {
    if (!item.photo_url) {
      Alert.alert(
        "Source photo unavailable",
        "This part does not have a saved source photo."
      );
      return;
    }

    setPhotoViewer({
      uri: item.photo_url,
      label: `${item.description || displayPartNumber(item) || "Inventory Item"} · ${item.photo || "Source Photo"}`,
    });
    lastPhotoViewerTapTime.current = 0;
    photoViewerIsZoomed.current = false;
  }

  function openReviewItem(item: ReportRecord) {
    setSelectedReviewItem(item);
    setReviewDraft({ ...item });
  }

  function closeReviewItem() {
    if (isSavingReviewItem || isRemovingReviewItem) {
      return;
    }

    setSelectedReviewItem(null);
    setReviewDraft(null);
  }

  function updateReviewDraft(field: keyof ReportRecord, value: string) {
    setReviewDraft((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current
    );
  }

  async function mutateReviewItem(
    item: ReportRecord,
    body: Record<string, unknown>
  ) {
    if (!item.id) {
      throw new Error("This review item does not have a saved inventory ID.");
    }

    const response = await apiFetch(
      `${API_BASE_URL}/api/walkthrough-items/${item.id}`,
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const text = await response.text();
    let data: ReviewItemMutationResponse;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("The server returned an unreadable review response.");
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || data.details || "The inventory item could not be updated."
      );
    }

    return data;
  }

  async function confirmReviewItem() {
    if (!selectedReviewItem) {
      return;
    }

    try {
      setIsSavingReviewItem(true);

      await mutateReviewItem(selectedReviewItem, {
        is_confirmed: true,
        review_needed: false,
        was_edited: selectedReviewItem.was_edited || false,
      });

      setSelectedReviewItem(null);
      setReviewDraft(null);
      await loadReport(false);
    } catch (error) {
      Alert.alert(
        "Unable to confirm item",
        error instanceof Error
          ? error.message
          : "The inventory item could not be confirmed."
      );
    } finally {
      setIsSavingReviewItem(false);
    }
  }

  async function saveEditedReviewItem() {
    if (!selectedReviewItem || !reviewDraft) {
      return;
    }

    try {
      setIsSavingReviewItem(true);

      await mutateReviewItem(selectedReviewItem, {
        location: reviewDraft.location || "Unassigned",
        vendor: reviewDraft.vendor || "",
        manufacturer: reviewDraft.manufacturer || "",
        manufacturer_part_number:
          reviewDraft.manufacturer_part_number || "",
        vendor_part_number: reviewDraft.vendor_part_number || "",
        part_number: reviewDraft.part_number || "",
        description: reviewDraft.description || "",
        size_specification: reviewDraft.size_specification || "",
        package_quantity: reviewDraft.package_quantity || "",
        label_text: reviewDraft.label_text || "",
        notes: reviewDraft.notes || "",
        is_confirmed: true,
        review_needed: false,
        was_edited: true,
      });

      setSelectedReviewItem(null);
      setReviewDraft(null);
      await loadReport(false);
    } catch (error) {
      Alert.alert(
        "Unable to save item",
        error instanceof Error
          ? error.message
          : "The inventory item could not be saved."
      );
    } finally {
      setIsSavingReviewItem(false);
    }
  }

  function confirmRemoveReviewItem() {
    if (!selectedReviewItem?.id) {
      return;
    }

    Alert.alert(
      "Remove inventory item?",
      "This permanently removes this saved item from the walkthrough and regenerates its report.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void removeReviewItem();
          },
        },
      ]
    );
  }

  async function removeReviewItem() {
    if (!selectedReviewItem?.id) {
      return;
    }

    try {
      setIsRemovingReviewItem(true);

      const response = await apiFetch(
        `${API_BASE_URL}/api/walkthrough-items/${selectedReviewItem.id}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const text = await response.text();
      let data: ReviewItemMutationResponse;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("The server returned an unreadable removal response.");
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || data.details || "The inventory item could not be removed."
        );
      }

      setSelectedReviewItem(null);
      setReviewDraft(null);
      await loadReport(false);
    } catch (error) {
      Alert.alert(
        "Unable to remove item",
        error instanceof Error
          ? error.message
          : "The inventory item could not be removed."
      );
    } finally {
      setIsRemovingReviewItem(false);
    }
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

  function displayPartNumber(item: ReportRecord): string {
    return (
      item.manufacturer_part_number ||
      item.vendor_part_number ||
      item.part_number ||
      ""
    );
  }

  const activeFilterCount =
    Number(Boolean(inventoryArea)) + Number(Boolean(inventoryVendor));

  function filterButtonLabel(): string {
    if (!activeFilterCount) return "Filters";
    if (activeFilterCount === 1) {
      return inventoryArea ? `Area: ${inventoryArea}` : `Vendor: ${inventoryVendor}`;
    }
    return `${activeFilterCount} Filters`;
  }

  function openInventoryFilters() {
    setDraftInventoryArea(inventoryArea);
    setDraftInventoryVendor(inventoryVendor);
    setFilterModalVisible(true);
  }

  function applyInventoryFilters() {
    setInventoryArea(draftInventoryArea);
    setInventoryVendor(draftInventoryVendor);
    setFilterModalVisible(false);
  }

  function clearInventoryFilters() {
    setInventoryArea("");
    setInventoryVendor("");
    setDraftInventoryArea("");
    setDraftInventoryVendor("");
  }

  function renderRecord({ item }: { item: ReportRecord }) {
    if (reportType === "inventory") {
      const partNumber = displayPartNumber(item) || "No part number";
      const locations = item.locations || (item.location ? [item.location] : []);
      const vendorNames = Array.isArray(item.vendors)
        ? item.vendors
        : item.vendor
          ? [item.vendor]
          : [];

      return (
        <View style={styles.uniquePartCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedPart(item)}
            style={({ pressed }) => [
              styles.uniquePartMain,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.uniquePartText}>
              <Text numberOfLines={2} style={styles.uniquePartTitle}>
                {item.description || partNumber}
              </Text>
              <Text numberOfLines={1} style={styles.uniquePartNumber}>
                {partNumber}
              </Text>
              <Text numberOfLines={1} style={styles.uniquePartMeta}>
                {vendorNames.join(", ") || "Vendor not identified"}
                {locations.length ? ` · ${locations.join(", ")}` : ""}
              </Text>
              <Text style={styles.uniquePartSubtext}>
                Last seen {formatDate(item.last_seen_at)} · Seen in {item.walkthrough_count || 0} {item.walkthrough_count === 1 ? "walkthrough" : "walkthroughs"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#93C5FD" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!item.photo_url}
            onPress={() => openPartPhoto(item)}
            style={({ pressed }) => [
              styles.uniquePartPhotoButton,
              !item.photo_url && styles.disabledButton,
              pressed && item.photo_url && styles.buttonPressed,
            ]}
          >
            <Ionicons name="image-outline" size={19} color={item.photo_url ? "#93C5FD" : "#52657D"} />
            <Text style={[styles.uniquePartPhotoText, !item.photo_url && styles.uniquePartPhotoTextDisabled]}>
              Latest Photo
            </Text>
          </Pressable>
        </View>
      );
    }

    if (reportType === "vendors") {
      const vendorName = item.vendor || "Unknown vendor";

      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => openVendor(vendorName)}
          style={({ pressed }) => [
            styles.recordCard,
            pressed && styles.buttonPressed,
          ]}
        >
          <View style={styles.recordHeader}>
            <Text style={styles.recordTitle}>{vendorName}</Text>
            <Text style={styles.recordArrow}>›</Text>
          </View>
          <Text style={styles.recordMeta}>
            {item.item_count || 0} items • {item.walkthrough_count || 0}{" "}
            walkthroughs
          </Text>
          <Text style={styles.recordSubtext}>
            Last seen {formatDate(item.last_seen_at)}
          </Text>
        </Pressable>
      );
    }

    if (
      ["walkthroughs", "active", "archived", "last"].includes(
        reportType
      )
    ) {
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => openWalkthrough(item)}
          style={({ pressed }) => [
            styles.recordCard,
            pressed && styles.buttonPressed,
          ]}
        >
          <View style={styles.recordHeader}>
            <Text style={styles.recordTitle}>
              Walkthrough #{item.id}
            </Text>
            <Text style={styles.recordArrow}>›</Text>
          </View>
          <Text style={styles.recordMeta}>
            {item.item_count || 0} items • {item.photo_count || 0} photos
            {item.email_sent ? " • Emailed" : ""}
          </Text>
          <Text style={styles.recordSubtext}>
            {formatDate(item.completed_at)} •{" "}
            {item.is_archived ? "Archived" : "Active"}
          </Text>
        </Pressable>
      );
    }

    if (reportType === "photos") {
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => openWalkthrough(item)}
          style={({ pressed }) => [
            styles.recordCard,
            pressed && styles.buttonPressed,
          ]}
        >
          <View style={styles.recordHeader}>
            <Text style={styles.recordTitle}>
              {photoDisplayLabel(item.photo)}
            </Text>
            <Text style={styles.recordArrow}>›</Text>
          </View>
          <Text style={styles.photoWalkthrough}>
            Walkthrough #{item.walkthrough_id}
          </Text>
          <Text style={styles.recordMeta}>
            {item.item_count || 0} items • {item.review_item_count || 0}{" "}
            review
          </Text>
          <Text style={styles.recordSubtext}>
            {item.vendors || "No vendor"} • {formatDate(item.completed_at)}
          </Text>
        </Pressable>
      );
    }

    if (reportType === "review") {
      const partNumber = displayPartNumber(item) || "No part number";

      return (
        <View style={styles.reviewCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openReviewItem(item)}
            style={({ pressed }) => [
              styles.reviewCardMain,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.reviewCardText}>
              <View style={styles.reviewCardTitleRow}>
                <Text numberOfLines={2} style={styles.reviewCardTitle}>
                  {item.description || "Inventory item"}
                </Text>
                <View style={styles.reviewConfidenceBadge}>
                  <Text style={styles.reviewConfidenceText}>
                    {confidenceText(item.confidence)}
                  </Text>
                </View>
              </View>

              <Text style={styles.reviewCardPartNumber}>{partNumber}</Text>
              <Text numberOfLines={1} style={styles.reviewCardMeta}>
                {item.vendor || "Vendor not identified"}
                {" · "}
                {item.location || "Unassigned"}
              </Text>
              <Text style={styles.reviewCardSubtext}>
                Walkthrough #{item.walkthrough_id || "—"} · {formatDate(recordDate(item))}
              </Text>

              <View style={styles.reviewStatusRow}>
                <Ionicons name="alert-circle-outline" size={16} color="#F8D477" />
                <Text style={styles.reviewStatusText}>Needs review</Text>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#93C5FD" />
          </Pressable>

          <View style={styles.reviewQuickActions}>
            <Pressable
              accessibilityRole="button"
              disabled={!item.photo_url}
              onPress={() => openPartPhoto(item)}
              style={({ pressed }) => [
                styles.reviewPhotoButton,
                !item.photo_url && styles.disabledButton,
                pressed && item.photo_url && styles.buttonPressed,
              ]}
            >
              <Ionicons
                name="image-outline"
                size={18}
                color={item.photo_url ? "#BFDBFE" : "#52657D"}
              />
              <Text
                style={[
                  styles.reviewPhotoButtonText,
                  !item.photo_url && styles.reviewPhotoButtonTextDisabled,
                ]}
              >
                Source Photo
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => openReviewItem(item)}
              style={({ pressed }) => [
                styles.reviewActionButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.reviewActionButtonText}>Review</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    const fallbackPartNumber =
      item.manufacturer_part_number ||
      item.vendor_part_number ||
      item.part_number ||
      "No part number";

    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => openWalkthrough(item)}
        style={({ pressed }) => [
          styles.recordCard,
          pressed && styles.buttonPressed,
        ]}
      >
        <View style={styles.recordHeader}>
          <View style={styles.recordTitleArea}>
            <Text style={styles.recordTitle}>
              {item.description || "Inventory item"}
            </Text>
            <Text style={styles.partNumber}>{fallbackPartNumber}</Text>
          </View>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceText}>
              {confidenceText(item.confidence)}
            </Text>
          </View>
        </View>
        <Text style={styles.recordMeta}>
          {item.vendor || "Vendor not identified"} • Walkthrough #{item.walkthrough_id}
        </Text>
        <Text style={styles.recordSubtext}>
          {item.photo || "No photo name"} • {formatDate(recordDate(item))}
        </Text>
        {item.review_needed || !item.is_confirmed ? (
          <Text style={styles.reviewText}>Needs review</Text>
        ) : null}
      </Pressable>
    );
  }

  const customerName =
    report?.customer.company_name || fallbackCustomerName;

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
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          {customerLogoUrl ? (
            <View style={styles.headerLogoFrame}>
              <Image
                source={{ uri: customerLogoUrl }}
                resizeMode="contain"
                style={styles.customerLogoImage}
              />
            </View>
          ) : null}

          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.title}>
              {isUniquePartsReport
                ? "Inventory Items"
                : isReviewReport
                  ? "Review Items"
                  : (report?.report_title || "Customer Report")}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {customerName}
            </Text>
          </View>
        </View>

        {isUniquePartsReport && report ? (
          <View style={styles.inventoryHero}>
            <View style={styles.inventoryHeroHeader}>
              <View style={styles.inventoryHeroText}>
                <Text style={styles.inventoryEyebrow}>CUSTOMER INVENTORY</Text>
                <Text style={styles.inventoryHeroTitle}>{customerName}</Text>
                <Text style={styles.inventoryHeroSubtitle}>
                  Distinct parts identified across completed walkthroughs
                </Text>
              </View>
              {customerLogoUrl ? (
                <View style={styles.inventoryHeroLogoFrame}>
                  <Image
                    source={{ uri: customerLogoUrl }}
                    resizeMode="contain"
                    style={styles.customerLogoImage}
                  />
                </View>
              ) : (
                <View style={styles.inventoryHeroBadge}>
                  <Ionicons name="cube-outline" size={22} color="#93C5FD" />
                </View>
              )}
            </View>

            <View style={styles.inventoryStatsRow}>
              <View style={styles.inventoryStat}>
                <Text style={styles.inventoryStatValue}>{report.record_count}</Text>
                <Text style={styles.inventoryStatLabel}>Distinct Parts</Text>
              </View>
              <View style={styles.inventoryStatDivider} />
              <View style={styles.inventoryStat}>
                <Text style={styles.inventoryStatValue}>{availableInventoryVendors.length}</Text>
                <Text style={styles.inventoryStatLabel}>Vendors</Text>
              </View>
              <View style={styles.inventoryStatDivider} />
              <View style={styles.inventoryStat}>
                <Text style={styles.inventoryStatValue}>{availableInventoryAreas.length}</Text>
                <Text style={styles.inventoryStatLabel}>Areas</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            onSubmitEditing={() => setAppliedSearch(searchDraft.trim())}
            placeholder={
              isUniquePartsReport
                ? "Search part #, description, vendor…"
                : isReviewReport
                  ? "Search review items…"
                  : "Search this report"
            }
            placeholderTextColor="#70839D"
            returnKeyType="search"
            style={styles.searchInput}
          />
          <Pressable
            onPress={() => setAppliedSearch(searchDraft.trim())}
            style={({ pressed }) => [
              styles.searchButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.searchButtonText}>Search</Text>
          </Pressable>
        </View>

        {isUniquePartsReport ? (
          <>
            <View style={styles.inventoryFilterRow}>
              <Pressable
                onPress={openInventoryFilters}
                style={({ pressed }) => [
                  styles.inventoryFilterButton,
                  activeFilterCount > 0 && styles.inventoryFilterButtonActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={activeFilterCount > 0 ? "#FFFFFF" : "#BFDBFE"}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.inventoryFilterButtonText,
                    activeFilterCount > 0 && styles.inventoryFilterButtonTextActive,
                  ]}
                >
                  {filterButtonLabel()}
                </Text>
              </Pressable>
              {activeFilterCount > 0 ? (
                <Pressable
                  onPress={clearInventoryFilters}
                  style={({ pressed }) => [styles.clearFiltersButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.clearFiltersText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.filterRow}>
              {[
                { value: "newest", label: "Last Seen" },
                { value: "part_asc", label: "Part #" },
                { value: "description_asc", label: "Description" },
              ].map((option, index, values) => (
                <Pressable
                  key={option.value}
                  onPress={() => setSort(option.value)}
                  style={({ pressed }) => [
                    styles.chip,
                    index === values.length - 1 && styles.lastChip,
                    sort === option.value && styles.chipSelected,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={[styles.chipText, sort === option.value && styles.chipTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.filterRow}>
              {DATE_OPTIONS.map((option, index) => (
                <Pressable key={option.value} onPress={() => setDays(option.value)} style={({ pressed }) => [styles.chip, index === DATE_OPTIONS.length - 1 && styles.lastChip, days === option.value && styles.chipSelected, pressed && styles.buttonPressed]}>
                  <Text style={[styles.chipText, days === option.value && styles.chipTextSelected]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              {SORT_OPTIONS.map((option, index) => (
                <Pressable key={option.value} onPress={() => setSort(option.value)} style={({ pressed }) => [styles.chip, index === SORT_OPTIONS.length - 1 && styles.lastChip, sort === option.value && styles.chipSelected, pressed && styles.buttonPressed]}>
                  <Text style={[styles.chipText, sort === option.value && styles.chipTextSelected]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={styles.reportToolbar}>
          <Text style={styles.recordCount}>
            {report?.record_count || 0}{" "}
            {isUniquePartsReport
              ? (report?.record_count || 0) === 1
                ? "distinct part identified"
                : "distinct parts identified"
              : isReviewReport
                ? (report?.record_count || 0) === 1
                  ? "item needs review"
                  : "items need review"
                : "records"}
          </Text>
          <Pressable
            disabled={isExporting}
            onPress={exportReport}
            style={({ pressed }) => [
              styles.exportButton,
              isExporting && styles.disabledButton,
              pressed && !isExporting && styles.buttonPressed,
            ]}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.exportButtonText}>
                {isUniquePartsReport ? "Export Inventory" : "Export Excel"}
              </Text>
            )}
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading report…</Text>
          </View>
        ) : (
          <FlatList
            data={report?.records || []}
            keyExtractor={(item, index) =>
              `${reportType}-${item.id || item.walkthrough_id || item.vendor || item.photo || "record"}-${item.item_number || index}`
            }
            renderItem={renderRecord}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                tintColor="#3B82F6"
                onRefresh={() => {
                  setIsRefreshing(true);
                  loadReport(false);
                }}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Ionicons
                  name={
                    isUniquePartsReport
                      ? "cube-outline"
                      : isReviewReport
                        ? "checkmark-done-outline"
                        : "search-outline"
                  }
                  size={30}
                  color="#52657D"
                />
                <Text style={styles.emptyTitle}>
                  {isUniquePartsReport
                    ? "No matching inventory"
                    : isReviewReport
                      ? "Review queue is clear"
                      : "No matching records"}
                </Text>
                <Text style={styles.emptyText}>
                  {isUniquePartsReport
                    ? "Try clearing a filter or searching for another part, vendor, or area."
                    : isReviewReport
                      ? "There are no unresolved inventory items matching these filters."
                      : "Try a different search, date range, or report."}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <Modal
        visible={filterModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setFilterModalVisible(false)} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Filter Inventory Items</Text>
            <Pressable onPress={applyInventoryFilters} style={styles.modalApplyButton}>
              <Text style={styles.modalApplyText}>Apply</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.filterModalContent}>
            <Text style={styles.filterHelpText}>
              Choose an area, a vendor, or both. Results update after you tap Apply.
            </Text>

            <Text style={styles.filterSectionTitle}>Area</Text>
            {["", ...availableInventoryAreas].map((areaName) => (
              <Pressable
                key={`area-${areaName || "all"}`}
                onPress={() => setDraftInventoryArea(areaName)}
                style={styles.filterOption}
              >
                <Text style={styles.filterOptionText}>{areaName || "All Areas"}</Text>
                {draftInventoryArea === areaName ? (
                  <Ionicons name="checkmark-circle" size={22} color="#60A5FA" />
                ) : null}
              </Pressable>
            ))}

            <Text style={styles.filterSectionTitle}>Vendor</Text>
            {["", ...availableInventoryVendors].map((vendorName) => (
              <Pressable
                key={`vendor-${vendorName || "all"}`}
                onPress={() => setDraftInventoryVendor(vendorName)}
                style={styles.filterOption}
              >
                <Text style={styles.filterOptionText}>{vendorName || "All Vendors"}</Text>
                {draftInventoryVendor === vendorName ? (
                  <Ionicons name="checkmark-circle" size={22} color="#60A5FA" />
                ) : null}
              </Pressable>
            ))}

            {(draftInventoryArea || draftInventoryVendor) ? (
              <Pressable
                onPress={() => {
                  setDraftInventoryArea("");
                  setDraftInventoryVendor("");
                }}
                style={({ pressed }) => [
                  styles.resetModalFiltersButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.resetModalFiltersText}>Reset Selections</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={selectedPart !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedPart(null)}>
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSelectedPart(null)} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Inventory Part</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>
          {selectedPart ? (
            <ScrollView contentContainerStyle={styles.partDetailContent}>
              <Text style={styles.partDetailTitle}>{selectedPart.description || displayPartNumber(selectedPart) || "Unique Part"}</Text>
              {displayPartNumber(selectedPart) ? <Text style={styles.partDetailNumber}>{displayPartNumber(selectedPart)}</Text> : null}
              <View style={styles.partDetailCard}>
                <Text style={styles.partDetailLabel}>Vendor</Text><Text style={styles.partDetailValue}>{selectedPart.vendor || "Not identified"}</Text>
                <Text style={styles.partDetailLabel}>Manufacturer</Text><Text style={styles.partDetailValue}>{selectedPart.manufacturer || "Not identified"}</Text>
                <Text style={styles.partDetailLabel}>Size / Specification</Text><Text style={styles.partDetailValue}>{selectedPart.size_specification || "Not provided"}</Text>
                <Text style={styles.partDetailLabel}>Package Quantity</Text><Text style={styles.partDetailValue}>{selectedPart.package_quantity || "Not provided"}</Text>
                <Text style={styles.partDetailLabel}>Locations</Text><Text style={styles.partDetailValue}>{(selectedPart.locations || []).join(", ") || selectedPart.location || "Unassigned"}</Text>
                <Text style={styles.partDetailLabel}>History</Text><Text style={styles.partDetailValue}>{selectedPart.walkthrough_count || 0} walkthroughs · {selectedPart.appearance_count || 0} appearances</Text>
                <Text style={styles.partDetailLabel}>Last Seen</Text><Text style={styles.partDetailValue}>{formatDate(selectedPart.last_seen_at)}</Text>
              </View>
              <Pressable disabled={!selectedPart.photo_url} onPress={() => openPartPhoto(selectedPart)} style={({ pressed }) => [styles.viewPhotoButton, !selectedPart.photo_url && styles.disabledButton, pressed && selectedPart.photo_url && styles.buttonPressed]}>
                <Ionicons name="image-outline" size={22} color="#FFFFFF" />
                <Text style={styles.viewPhotoButtonText}>View Latest Source Photo</Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={selectedReviewItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeReviewItem}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Pressable
              disabled={isSavingReviewItem || isRemovingReviewItem}
              onPress={closeReviewItem}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Review Item</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          {selectedReviewItem && reviewDraft ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.reviewDetailContent}
            >
              <View style={styles.reviewDetailHero}>
                <View style={styles.reviewDetailHeroText}>
                  <Text style={styles.reviewDetailEyebrow}>NEEDS REVIEW</Text>
                  <Text style={styles.reviewDetailTitle}>
                    {reviewDraft.description ||
                      displayPartNumber(reviewDraft) ||
                      "Inventory item"}
                  </Text>
                  <Text style={styles.reviewDetailSubtitle}>
                    Walkthrough #{reviewDraft.walkthrough_id || "—"} ·{" "}
                    {reviewDraft.location || "Unassigned"}
                  </Text>
                </View>
                <View style={styles.reviewDetailConfidence}>
                  <Text style={styles.reviewDetailConfidenceValue}>
                    {confidenceText(reviewDraft.confidence)}
                  </Text>
                  <Text style={styles.reviewDetailConfidenceLabel}>
                    Confidence
                  </Text>
                </View>
              </View>

              <Pressable
                disabled={!selectedReviewItem.photo_url}
                onPress={() => openPartPhoto(selectedReviewItem)}
                style={({ pressed }) => [
                  styles.reviewSourcePhotoButton,
                  !selectedReviewItem.photo_url && styles.disabledButton,
                  pressed &&
                    selectedReviewItem.photo_url &&
                    styles.buttonPressed,
                ]}
              >
                <Ionicons name="image-outline" size={21} color="#FFFFFF" />
                <Text style={styles.reviewSourcePhotoButtonText}>
                  View Source Photo
                </Text>
              </Pressable>

              <View style={styles.reviewEditCard}>
                <Text style={styles.reviewEditHeading}>Inventory details</Text>
                <Text style={styles.reviewEditHelp}>
                  Correct anything the AI misread, then save. Saving also marks
                  this item reviewed.
                </Text>

                {[
                  ["Manufacturer Part #", "manufacturer_part_number"],
                  ["Vendor Part #", "vendor_part_number"],
                  ["Part #", "part_number"],
                  ["Description", "description"],
                  ["Vendor", "vendor"],
                  ["Manufacturer", "manufacturer"],
                  ["Size / Specification", "size_specification"],
                  ["Package Quantity", "package_quantity"],
                  ["Location", "location"],
                  ["Label Text", "label_text"],
                  ["Notes", "notes"],
                ].map(([label, field]) => (
                  <View key={field} style={styles.reviewFieldGroup}>
                    <Text style={styles.reviewFieldLabel}>{label}</Text>
                    <TextInput
                      value={String(reviewDraft[field as keyof ReportRecord] || "")}
                      onChangeText={(value) =>
                        updateReviewDraft(field as keyof ReportRecord, value)
                      }
                      editable={!isSavingReviewItem && !isRemovingReviewItem}
                      multiline={field === "description" || field === "label_text" || field === "notes"}
                      placeholder={`Enter ${label.toLowerCase()}`}
                      placeholderTextColor="#5F728B"
                      style={[
                        styles.reviewFieldInput,
                        (field === "description" ||
                          field === "label_text" ||
                          field === "notes") &&
                          styles.reviewFieldInputMultiline,
                      ]}
                    />
                  </View>
                ))}
              </View>

              <Pressable
                disabled={isSavingReviewItem || isRemovingReviewItem}
                onPress={saveEditedReviewItem}
                style={({ pressed }) => [
                  styles.reviewSaveButton,
                  (isSavingReviewItem || isRemovingReviewItem) &&
                    styles.disabledButton,
                  pressed &&
                    !isSavingReviewItem &&
                    !isRemovingReviewItem &&
                    styles.buttonPressed,
                ]}
              >
                {isSavingReviewItem ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.reviewSaveButtonText}>
                      Save Changes & Confirm
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                disabled={isSavingReviewItem || isRemovingReviewItem}
                onPress={confirmReviewItem}
                style={({ pressed }) => [
                  styles.reviewConfirmButton,
                  (isSavingReviewItem || isRemovingReviewItem) &&
                    styles.disabledButton,
                  pressed &&
                    !isSavingReviewItem &&
                    !isRemovingReviewItem &&
                    styles.buttonPressed,
                ]}
              >
                <Ionicons name="checkmark-circle-outline" size={21} color="#9FE7C7" />
                <Text style={styles.reviewConfirmButtonText}>
                  Looks Correct — Confirm
                </Text>
              </Pressable>

              <Pressable
                disabled={isSavingReviewItem || isRemovingReviewItem}
                onPress={confirmRemoveReviewItem}
                style={({ pressed }) => [
                  styles.reviewRemoveButton,
                  (isSavingReviewItem || isRemovingReviewItem) &&
                    styles.disabledButton,
                  pressed &&
                    !isSavingReviewItem &&
                    !isRemovingReviewItem &&
                    styles.buttonPressed,
                ]}
              >
                {isRemovingReviewItem ? (
                  <ActivityIndicator size="small" color="#FCA5A5" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={19} color="#FCA5A5" />
                    <Text style={styles.reviewRemoveButtonText}>
                      Remove Inventory Item
                    </Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.reviewRemoveHelp}>
                Remove is permanent and should only be used when the AI created
                an item that does not belong in the walkthrough.
              </Text>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal visible={photoViewer !== null} animationType="fade" presentationStyle="pageSheet" allowSwipeDismissal onDismiss={closePhotoViewer} onRequestClose={closePhotoViewer}>
        <View style={styles.viewerSafeArea}>
          <View style={[styles.viewerHeader, { minHeight: 68 + safeAreaInsets.top, paddingTop: safeAreaInsets.top }]}>
            <Pressable onPress={closePhotoViewer} style={styles.viewerCloseButton}><Text style={styles.viewerCloseText}>Close</Text></Pressable>
            <View style={styles.viewerTitleArea}><Text numberOfLines={1} style={styles.viewerTitle}>{photoViewer?.label || "Source Photo"}</Text><Text style={styles.viewerHint}>Pinch or double-tap to zoom</Text></View>
            <View style={styles.viewerSpacer} />
          </View>
          {photoViewer ? (
            <ScrollView ref={photoViewerScrollRef} style={styles.viewerScroll} contentContainerStyle={styles.viewerContent} centerContent minimumZoomScale={1} maximumZoomScale={5} onScroll={(event) => { const zoomScale = event.nativeEvent.zoomScale; if (typeof zoomScale === "number") photoViewerIsZoomed.current = zoomScale > 1.1; }} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
              <Pressable onPress={handlePhotoViewerTap} style={{ width: windowWidth, height: viewerHeight }}><Image source={{ uri: photoViewer.uri }} resizeMode="contain" style={styles.viewerImage} /></Pressable>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0B1220" },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 12 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#31547D",
    backgroundColor: "#17243A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  backText: { color: "#FFFFFF", fontSize: 34, lineHeight: 36, marginTop: -3 },
  headerLogoFrame: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2EC",
    backgroundColor: "#FFFFFF",
    padding: 5,
    marginRight: 12,
    overflow: "hidden",
  },
  customerLogoImage: {
    width: "100%",
    height: "100%",
  },
  headerText: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "#94A3B8", fontSize: 13, marginTop: 3 },
  inventoryHero: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#31547D",
    backgroundColor: "#14243A",
    padding: 16,
    marginBottom: 12,
  },
  inventoryHeroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  inventoryHeroText: { flex: 1, paddingRight: 12 },
  inventoryEyebrow: {
    color: "#7DA9D8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 5,
  },
  inventoryHeroTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  inventoryHeroSubtitle: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  inventoryHeroBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#16283D",
    alignItems: "center",
    justifyContent: "center",
  },
  inventoryHeroLogoFrame: {
    width: 48,
    height: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D9E2EC",
    backgroundColor: "#FFFFFF",
    padding: 5,
    overflow: "hidden",
  },
  inventoryStatsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#29415E",
  },
  inventoryStat: {
    flex: 1,
    alignItems: "center",
  },
  inventoryStatValue: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
  },
  inventoryStatLabel: {
    color: "#8FA2BA",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 3,
    textAlign: "center",
  },
  inventoryStatDivider: {
    width: 1,
    backgroundColor: "#29415E",
    marginVertical: 2,
  },
  searchRow: { flexDirection: "row", marginBottom: 10 },
  searchInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#2E4562",
    backgroundColor: "#111D2F",
    color: "#FFFFFF",
    paddingHorizontal: 13,
    marginRight: 8,
  },
  searchButton: {
    minWidth: 82,
    borderRadius: 13,
    backgroundColor: "#2457D6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  searchButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  filterRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 38,
    marginBottom: 8,
  },
  chip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2B405B",
    backgroundColor: "#101B2C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginRight: 7,
  },
  lastChip: { marginRight: 0 },
  chipSelected: { borderColor: "#3B82F6", backgroundColor: "#16396D" },
  chipText: { color: "#8FA2BA", fontSize: 11, fontWeight: "800" },
  chipTextSelected: { color: "#DCEBFF" },
  reportToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
  },
  recordCount: { color: "#9FB0C5", fontSize: 12, fontWeight: "700" },
  exportButton: {
    minWidth: 112,
    minHeight: 38,
    borderRadius: 11,
    backgroundColor: "#176347",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  exportButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  disabledButton: { opacity: 0.55 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#94A3B8", fontSize: 13, marginTop: 10 },
  listContent: { paddingTop: 4, paddingBottom: 56 },
  recordCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#283C57",
    backgroundColor: "#111D2F",
    padding: 14,
    marginBottom: 9,
  },
  recordHeader: { flexDirection: "row", alignItems: "center" },
  recordTitleArea: { flex: 1, paddingRight: 10 },
  recordTitle: { flex: 1, color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  recordArrow: { color: "#93C5FD", fontSize: 25, fontWeight: "800" },
  partNumber: { color: "#93C5FD", fontSize: 12, marginTop: 4 },
  recordMeta: { color: "#C1D1E5", fontSize: 12, marginTop: 9 },
  photoWalkthrough: {
    color: "#71849D",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  recordSubtext: { color: "#71849D", fontSize: 11, marginTop: 5 },
  confidenceBadge: {
    minWidth: 48,
    borderRadius: 9,
    backgroundColor: "#193A2E",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  confidenceText: { color: "#7DE2B3", fontSize: 11, fontWeight: "900" },
  reviewText: { color: "#F8D477", fontSize: 11, fontWeight: "800", marginTop: 8 },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#283C57",
    backgroundColor: "#111D2F",
    padding: 24,
    alignItems: "center",
    marginTop: 16,
  },
  emptyTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  emptyText: { color: "#8FA2BA", fontSize: 12, marginTop: 7, textAlign: "center" },
  inventoryFilterRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  inventoryFilterButton: { minHeight: 40, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "#2B405B", backgroundColor: "#101B2C", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12 },
  inventoryFilterButtonActive: { borderColor: "#3B82F6", backgroundColor: "#16396D" },
  inventoryFilterButtonText: { flexShrink: 1, color: "#BFDBFE", fontSize: 12, fontWeight: "800" },
  inventoryFilterButtonTextActive: { color: "#FFFFFF" },
  clearFiltersButton: { minHeight: 40, paddingHorizontal: 15, borderRadius: 12, backgroundColor: "#17263A", alignItems: "center", justifyContent: "center", marginLeft: 8 },
  clearFiltersText: { color: "#93C5FD", fontSize: 12, fontWeight: "800" },
  uniquePartCard: { borderRadius: 16, borderWidth: 1, borderColor: "#283C57", backgroundColor: "#111D2F", marginBottom: 9, overflow: "hidden" },
  uniquePartMain: { flexDirection: "row", alignItems: "center", padding: 14 },
  uniquePartText: { flex: 1, paddingRight: 10 },
  uniquePartTitle: { color: "#FFFFFF", fontSize: 15, lineHeight: 20, fontWeight: "900" },
  uniquePartNumber: { color: "#93C5FD", fontSize: 12, fontWeight: "700", marginTop: 4 },
  uniquePartMeta: { color: "#C1D1E5", fontSize: 11, marginTop: 8 },
  uniquePartSubtext: { color: "#71849D", fontSize: 10, marginTop: 5 },
  uniquePartPhotoButton: { minHeight: 43, borderTopWidth: 1, borderTopColor: "#283C57", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#0F1A2A" },
  uniquePartPhotoText: { color: "#BFDBFE", fontSize: 12, fontWeight: "800" },
  uniquePartPhotoTextDisabled: { color: "#52657D" },
  modalSafeArea: { flex: 1, backgroundColor: "#0B1220" },
  modalHeader: { minHeight: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1C2D43", paddingHorizontal: 16 },
  modalCloseButton: { width: 72, minHeight: 40, justifyContent: "center" },
  modalCloseText: { color: "#93C5FD", fontSize: 14, fontWeight: "700" },
  modalTitle: { flex: 1, color: "#FFFFFF", fontSize: 17, fontWeight: "800", textAlign: "center" },
  modalHeaderSpacer: { width: 72 },
  modalApplyButton: { width: 72, minHeight: 40, alignItems: "flex-end", justifyContent: "center" },
  modalApplyText: { color: "#60A5FA", fontSize: 14, fontWeight: "900" },
  filterModalContent: { padding: 20, paddingBottom: 40 },
  filterHelpText: { color: "#8FA2BA", fontSize: 13, lineHeight: 19, marginBottom: 8 },
  filterSectionTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 8, marginBottom: 10 },
  filterOption: { minHeight: 52, borderBottomWidth: 1, borderBottomColor: "#26364F", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filterOptionText: { color: "#D8E2F0", fontSize: 15 },
  resetModalFiltersButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#31547D", alignItems: "center", justifyContent: "center", marginTop: 24 },
  resetModalFiltersText: { color: "#93C5FD", fontSize: 14, fontWeight: "800" },
  partDetailContent: { padding: 20, paddingBottom: 40 },
  partDetailTitle: { color: "#FFFFFF", fontSize: 22, lineHeight: 29, fontWeight: "800" },
  partDetailNumber: { color: "#93C5FD", fontSize: 16, fontWeight: "700", marginTop: 7 },
  partDetailCard: { borderRadius: 18, borderWidth: 1, borderColor: "#26364F", backgroundColor: "#121C2D", padding: 16, marginTop: 18 },
  partDetailLabel: { color: "#718096", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 12 },
  partDetailValue: { color: "#D8E2F0", fontSize: 14, lineHeight: 20, marginTop: 4 },
  viewPhotoButton: { minHeight: 54, borderRadius: 16, backgroundColor: "#2563EB", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  viewPhotoButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  reviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3B4659",
    backgroundColor: "#111D2F",
    marginBottom: 9,
    overflow: "hidden",
  },
  reviewCardMain: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  reviewCardText: { flex: 1, paddingRight: 10 },
  reviewCardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  reviewCardTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  reviewConfidenceBadge: {
    minWidth: 48,
    borderRadius: 9,
    backgroundColor: "#2E2B1E",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  reviewConfidenceText: {
    color: "#F8D477",
    fontSize: 11,
    fontWeight: "900",
  },
  reviewCardPartNumber: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  reviewCardMeta: {
    color: "#C1D1E5",
    fontSize: 11,
    marginTop: 8,
  },
  reviewCardSubtext: {
    color: "#71849D",
    fontSize: 10,
    marginTop: 5,
  },
  reviewStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 9,
  },
  reviewStatusText: {
    color: "#F8D477",
    fontSize: 11,
    fontWeight: "800",
  },
  reviewQuickActions: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: "#283C57",
    flexDirection: "row",
    backgroundColor: "#0F1A2A",
  },
  reviewPhotoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRightWidth: 1,
    borderRightColor: "#283C57",
  },
  reviewPhotoButtonText: {
    color: "#BFDBFE",
    fontSize: 12,
    fontWeight: "800",
  },
  reviewPhotoButtonTextDisabled: { color: "#52657D" },
  reviewActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewActionButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  reviewDetailContent: { padding: 20, paddingBottom: 48 },
  reviewDetailHero: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#384A64",
    backgroundColor: "#121F32",
    padding: 16,
  },
  reviewDetailHeroText: { flex: 1, paddingRight: 12 },
  reviewDetailEyebrow: {
    color: "#F8D477",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  reviewDetailTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    marginTop: 6,
  },
  reviewDetailSubtitle: {
    color: "#8FA2BA",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },
  reviewDetailConfidence: {
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#2E2B1E",
    paddingHorizontal: 10,
  },
  reviewDetailConfidenceValue: {
    color: "#F8D477",
    fontSize: 20,
    fontWeight: "900",
  },
  reviewDetailConfidenceLabel: {
    color: "#B7A76D",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 3,
  },
  reviewSourcePhotoButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: "#2457D6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  reviewSourcePhotoButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  reviewEditCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#26364F",
    backgroundColor: "#121C2D",
    padding: 16,
    marginTop: 14,
  },
  reviewEditHeading: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  reviewEditHelp: {
    color: "#8FA2BA",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
    marginBottom: 4,
  },
  reviewFieldGroup: { marginTop: 13 },
  reviewFieldLabel: {
    color: "#91A4BC",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: 6,
  },
  reviewFieldInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E4562",
    backgroundColor: "#0E1827",
    color: "#FFFFFF",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reviewFieldInputMultiline: {
    minHeight: 78,
    textAlignVertical: "top",
  },
  reviewSaveButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  reviewSaveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  reviewConfirmButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2E745D",
    backgroundColor: "#123428",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  reviewConfirmButtonText: {
    color: "#B9F3D9",
    fontSize: 14,
    fontWeight: "900",
  },
  reviewRemoveButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#60343D",
    backgroundColor: "#2B171D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 18,
  },
  reviewRemoveButtonText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "900",
  },
  reviewRemoveHelp: {
    color: "#7E8B9E",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  viewerSafeArea: { flex: 1, backgroundColor: "#02070D" },
  viewerHeader: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1C2D43", paddingHorizontal: 14 },
  viewerCloseButton: { width: 70, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#17283C" },
  viewerCloseText: { color: "#BFD5EA", fontSize: 13, fontWeight: "900" },
  viewerTitleArea: { flex: 1, alignItems: "center", paddingHorizontal: 10 },
  viewerTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  viewerHint: { color: "#71849D", fontSize: 10, marginTop: 2 },
  viewerSpacer: { width: 70 },
  viewerScroll: { flex: 1 },
  viewerContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
