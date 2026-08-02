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
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const API_BASE_URL = "https://walkthroughai-api.onrender.com";

type Customer = {
  id: number;
  company_name: string;
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
  vendors?: string | null;
  manufacturer?: string | null;
  manufacturer_part_number?: string | null;
  vendor_part_number?: string | null;
  part_number?: string | null;
  description?: string | null;
  size_specification?: string | null;
  package_quantity?: string | null;
  confidence?: number;
  review_needed?: boolean;
  is_confirmed?: boolean;
  was_edited?: boolean;
  email_sent?: boolean;
};

type CustomerReport = {
  customer: Customer;
  report_type: string;
  report_title: string;
  record_count: number;
  records: ReportRecord[];
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

  const [report, setReport] = useState<CustomerReport | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [days, setDays] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
          selectedVendor,
          appliedSearch,
          sort,
          days
        );
        const response = await fetch(
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
        selectedVendor,
        appliedSearch,
        sort,
        days
      );
      const response = await fetch(
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

  function renderRecord({ item }: { item: ReportRecord }) {
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

    const displayPartNumber =
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
            <Text style={styles.partNumber}>{displayPartNumber}</Text>
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
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.title}>
              {report?.report_title || "Customer Report"}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {customerName}
            </Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            onSubmitEditing={() => setAppliedSearch(searchDraft.trim())}
            placeholder="Search this report"
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

        <View style={styles.filterRow}>
          {DATE_OPTIONS.map((option, index) => (
            <Pressable
              key={option.value}
              onPress={() => setDays(option.value)}
              style={({ pressed }) => [
                styles.chip,
                index === DATE_OPTIONS.length - 1 && styles.lastChip,
                days === option.value && styles.chipSelected,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  days === option.value && styles.chipTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.filterRow}>
          {SORT_OPTIONS.map((option, index) => (
            <Pressable
              key={option.value}
              onPress={() => setSort(option.value)}
              style={({ pressed }) => [
                styles.chip,
                index === SORT_OPTIONS.length - 1 && styles.lastChip,
                sort === option.value && styles.chipSelected,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  sort === option.value && styles.chipTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.reportToolbar}>
          <Text style={styles.recordCount}>
            {report?.record_count || 0} records
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
              <Text style={styles.exportButtonText}>Export Excel</Text>
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
                <Text style={styles.emptyTitle}>No matching records</Text>
                <Text style={styles.emptyText}>
                  Try a different search, date range, or report.
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
  headerText: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "#94A3B8", fontSize: 13, marginTop: 3 },
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
  listContent: { paddingTop: 4, paddingBottom: 28 },
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
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
