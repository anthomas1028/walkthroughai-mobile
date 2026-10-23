import { nativeUploadSupported, newBatchId, enqueueNativeUpload, nativeUploadStatus, serverBatchStatus } from "../lib/native-upload";
import { completionAlertsSupported, setCompletionAlert, requestCompletionToken } from "../lib/completion-notifications";
import { SourcingPanel } from "../components/SourcingPanel";
import { SourcingState, applySourcingSelection } from "../lib/sourcing";
import { LabelSourcePhoto } from "../components/LabelSourcePhoto";
import { LabelRetakePanel } from "../components/LabelRetakePanel";
import { RetakeAttempt, RetakeReference, fillRetakeBlanks } from "../lib/label-retake";
import { photoOutcome, resultKey, mergeRecoveryResults } from "../lib/photo-accounting";
import { loadRecovery, saveRecovery, clearRecovery, retainPhotos, RecoveryDraft } from "../lib/recovery";
import { useAuth } from "../contexts/AuthContext";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { draftKey, restoreGroups, writeDraft } from "../lib/drafts";
import { Alert } from "../lib/alerts";
import * as ImageManipulator from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,

  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  API_BASE_URL,
  apiFetch,
  getCurrentUserEmail,
} from "../lib/api";


const SOURCING_ENABLED = Constants.expoConfig?.extra?.appVariant === "test" && Constants.expoConfig?.extra?.sourcing === true;
const LABEL_RETAKES_ENABLED = Constants.expoConfig?.extra?.appVariant === "test" && Constants.expoConfig?.extra?.labelRetakes === true;

const UPLOAD_API_URL = `${API_BASE_URL}/api/upload-sessions`;

const FINALIZE_API_URL = `${API_BASE_URL}/api/finalize`;

const JOB_POLL_INTERVAL_MS = 2500;

const ANALYSIS_WAITING_MESSAGES = [
  { heading: "Reading labels", text: "Clear, close-up photos help preserve part numbers and small print." },
  { heading: "Review comes next", text: "Check uncertain part numbers against the source photo before confirming." },
  { heading: "Organized by location", text: "Your location labels stay attached to the products in your report." },
];
const JOB_POLL_TIMEOUT_MS = 2 * 60 * 60 * 1000;

type SelectedPhoto = {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
  location: string;
};

type RecognitionResult = {
  photo: string;
  location: string;
  vendor: string;
  manufacturer: string;
  customer_part_number: string;
  fastenal_part_number: string;
  manufacturer_part_number: string;
  vendor_part_number: string;
  part_number: string;
  description: string;
  size_specification: string;
  package_quantity: string;
  label_text: string;
  confidence: number;
  review_needed: boolean;
  notes: string;
  source_bbox?: number[];
  source_identifier_bbox?: number[];
  sourcing_state?: SourcingState;
  sourcing_previous_fastenal?: string;
  sourcing_selection_id?: string;
  sourcing_lookup_id?: string;
  sourcing_lookup_token?: string;
  sourcing_target_token?: string;
  retake_attempt?: RetakeAttempt;
  retake_references?: RetakeReference[];
  was_edited?: boolean;
  is_confirmed?: boolean;
};

type SourcePhotoViewer = {
  uri: string;
  label: string;
};

type UploadApiResponse = {
  success: boolean;
  job_id?: string;
  status?: string;
  stage?: string;
  progress?: number;
  status_url?: string;
  customer?: string;
  customer_id?: number | null;
  photo_count?: number;
  message?: string;
  error?: string;
  details?: string;
};

type JobStatusApiResponse = {
  diagnostics?: Record<string, string>;
  success: boolean;
  job_id?: string;
  status?: "queued" | "processing" | "complete" | "failed" | string;
  stage?: string;
  progress?: number;
  message?: string;
  customer?: string;
  customer_id?: number | null;
  timestamp?: string;
  photo_count?: number;
  processed_photos?: number;
  result_count?: number;
  results?: RecognitionResult[];
  workbook_file?: string | null;
  download_url?: string | null;
  error?: string | null;
  details?: string | null;
};

type FinalizeApiResponse = {
  success: boolean;
  customer?: string;
  timestamp?: string;
  result_count?: number;
  results?: RecognitionResult[];
  workbook_file?: string | null;
  download_url?: string | null;
  email_requested?: boolean;
  email_sent?: boolean;
  recipient_email?: string | null;
  email_error?: string | null;
  message?: string;
  error?: string;
  details?: string;
};

type DiscardApiResponse = {
  success: boolean;
  discarded?: boolean;
  history_saved?: boolean;
  message?: string;
  error?: string;
  details?: string;
};

type EditableFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
};

function getSingleParameter(
  parameter: string | string[] | undefined
): string {
  if (Array.isArray(parameter)) {
    return parameter[0] ?? "";
  }

  return parameter ?? "";
}

function parsePhotos(
  parameter: string | string[] | undefined
): SelectedPhoto[] {
  const rawValue = getSingleParameter(parameter);

  if (!rawValue) {
    return [];
  }

  function parseValue(value: string): SelectedPhoto[] {
    const parsedValue: unknown = JSON.parse(value);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(
      (item): item is SelectedPhoto =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as SelectedPhoto).id === "string" &&
        typeof (item as SelectedPhoto).uri === "string"
      )
      .map((item) => ({
        ...item,
        location: cleanText((item as Partial<SelectedPhoto>).location),
      }));
  }

  try {
    return parseValue(decodeURIComponent(rawValue));
  } catch {
    try {
      return parseValue(rawValue);
    } catch (error) {
      console.error("Could not parse photos:", error);
      return [];
    }
  }
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeResult(
  value: Partial<RecognitionResult>
): RecognitionResult {
  const confidenceNumber = Number(value.confidence);

  return {
    ...value,
    customer_part_number: cleanText(value.customer_part_number),
    fastenal_part_number: cleanText(value.fastenal_part_number),
    photo: cleanText(value.photo),
    location: cleanText(value.location),
    vendor: cleanText(value.vendor),
    manufacturer: cleanText(value.manufacturer),
    manufacturer_part_number: cleanText(
      value.manufacturer_part_number
    ),
    vendor_part_number: cleanText(
      value.vendor_part_number
    ),
    part_number: cleanText(value.part_number),
    description: cleanText(value.description),
    size_specification: cleanText(
      value.size_specification
    ),
    package_quantity: cleanText(
      value.package_quantity
    ),
    label_text: cleanText(value.label_text),
    confidence: Number.isFinite(confidenceNumber)
      ? confidenceNumber
      : 0,
    review_needed:
      typeof value.review_needed === "boolean"
        ? value.review_needed
        : true,
    notes: cleanText(value.notes),
    was_edited: Boolean(value.was_edited),
    is_confirmed: Boolean(value.is_confirmed),
  };
}

function getConfidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) {
    return 0;
  }

  if (confidence <= 1) {
    return Math.round(
      Math.max(0, Math.min(1, confidence)) * 100
    );
  }

  return Math.round(
    Math.max(0, Math.min(100, confidence))
  );
}

function applySmartConfirmation(
  result: RecognitionResult
): RecognitionResult {
  return {
    ...result,
    is_confirmed: false,
    review_needed: true,
  };
}

function getReviewReasons(
  result: RecognitionResult
): string[] {
  const reasons: string[] = [];
  const confidence = getConfidencePercent(
    result.confidence
  );

  if (confidence < 90) {
    reasons.push(`Model confidence signal: ${confidence}%`);
  }

  if (!cleanText(result.vendor)) {
    reasons.push("Vendor is missing");
  }

  if (!cleanText(result.description)) {
    reasons.push("Description is missing");
  }

  const hasPartNumber =
    cleanText(result.manufacturer_part_number).length > 0 ||
    cleanText(result.vendor_part_number).length > 0 ||
    cleanText(result.part_number).length > 0 || cleanText(result.customer_part_number).length > 0 || cleanText(result.fastenal_part_number).length > 0;

  if (!hasPartNumber) {
    reasons.push("Part number is missing");
  }

  return reasons;
}


async function preparePhotosForUpload(
  photos: SelectedPhoto[]
): Promise<SelectedPhoto[]> {
  const preparedPhotos: SelectedPhoto[] = [];
  const uploadTimestamp = Date.now();

  for (const [index, photo] of photos.entries()) {
    try {
      const converted = await ImageManipulator.manipulateAsync(
        photo.uri,
        [],
        {
          compress: 0.92,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      preparedPhotos.push({
        ...photo,
        uri: converted.uri,
        fileName: `inventory-photo-${uploadTimestamp}-${index + 1}.jpg`,
        mimeType: "image/jpeg",
      });
    } catch (error) {
      console.warn("Photo conversion warning:", error);

      throw new Error(
        `Photo ${index + 1} could not be converted to JPEG. Please select it again and retry.`
      );
    }
  }

  return preparedPhotos;
}

function getFileName(
  photo: SelectedPhoto,
  index: number
): string {
  const existingName = cleanText(photo.fileName);

  if (existingName.includes(".")) {
    return existingName;
  }

  const mimeType = cleanText(photo.mimeType).toLowerCase();

  if (mimeType.includes("png")) {
    return `inventory-photo-${index + 1}.png`;
  }

  if (mimeType.includes("webp")) {
    return `inventory-photo-${index + 1}.webp`;
  }

  return `inventory-photo-${index + 1}.jpg`;
}

function getMimeType(photo: SelectedPhoto): string {
  const existingType = cleanText(photo.mimeType);

  if (existingType.startsWith("image/")) {
    return existingType;
  }

  const lowerName = cleanText(
    photo.fileName
  ).toLowerCase();

  if (lowerName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

function getSourcePhotoIndex(
  sourcePhotoName: string,
  photoCount: number
): number | null {
  const cleanedName = cleanText(sourcePhotoName);
  const numberedPhotoMatch = cleanedName.match(
    /(?:photo|image)[-_ ]*0*(\d+)/i
  );

  if (!numberedPhotoMatch) {
    return photoCount === 1 ? 0 : null;
  }

  const oneBasedIndex = Number(
    numberedPhotoMatch[1]
  );
  const zeroBasedIndex = oneBasedIndex - 1;

  if (
    !Number.isInteger(zeroBasedIndex) ||
    zeroBasedIndex < 0 ||
    zeroBasedIndex >= photoCount
  ) {
    return null;
  }

  return zeroBasedIndex;
}

function isValidEmail(email: string): boolean {
  const cleanedEmail = email.trim();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    cleanedEmail
  );
}

async function readJsonResponse<T>(
  response: Response
): Promise<T> {
  const responseText = await response.text();

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(
      `The server returned an unexpected response. HTTP ${response.status}.`
    );
  }
}

function ResultField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.resultField}>
      <Text style={styles.resultFieldLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.resultFieldValue,
          !value && styles.missingValue,
        ]}
      >
        {value || "Not identified"}
      </Text>
    </View>
  );
}

function EditableField({
  label,
  value,
  onChangeText,
  multiline = false,
  placeholder = "Not identified",
}: EditableFieldProps) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editFieldLabel}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#62758E"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        autoCorrect={false}
        style={[
          styles.editInput,
          multiline && styles.editInputMultiline,
        ]}
      />
    </View>
  );
}

export default function UploadScreen() {
  const { session } = useAuth();
  const recoveryRef = useRef<RecoveryDraft | null>(null);
  const analysisBusy = useRef(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [backendDiagnostics, setBackendDiagnostics] = useState<Record<string, string>>({});
  const [showPhotoDetails, setShowPhotoDetails] = useState(false);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);

  const pendingUpload = useRef<{
    key: string;
    prepared: SelectedPhoto[];
    uploadId: string;
    uploaded: Set<number>;
  } | null>(null);

  const { width: windowWidth, height: windowHeight } =
    useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const photoViewerImageHeight = Math.max(
    windowHeight - 120,
    320
  );

  const params = useLocalSearchParams<{
    resume?: string;
    photos?: string | string[];
    savedDraft?: string;
    resumeJobId?: string;
    customerId?: string | string[];
    customerName?: string | string[];
    customerEmail?: string | string[];
    contactName?: string | string[];
  }>();

  const customerId = getSingleParameter(
    params.customerId
  );

  const selectedCustomerName = getSingleParameter(
    params.customerName
  );

  const selectedContactName = getSingleParameter(
    params.contactName
  );

  const uploadMounted = useRef(true);
  useEffect(() => { uploadMounted.current = true; return () => { uploadMounted.current = false; }; }, []);
  const activeKey = `active-walkthrough:${session?.user.id || ""}`;
  const photoDraftKey = draftKey(session?.user.id || "", customerId);
  const resumeJobId = typeof params.resumeJobId === "string" ? params.resumeJobId : "";
  const [photos, setPhotos] = useState<SelectedPhoto[]>(() => parsePhotos(params.photos));
  useEffect(() => {
    if (params.savedDraft !== "true" || !session) return;
    restoreGroups(photoDraftKey).then(groups => setPhotos((groups || []).flatMap(group => group.photos.map((photo: any) => ({ ...photo, location: group.name }))))).catch(() => Alert.alert("Photos unavailable", "Return to photos and select them again."));
  }, [photoDraftKey, params.savedDraft]);

  const [walkthroughName, setWalkthroughName] =
    useState(
      selectedCustomerName || "Mobile Walkthrough"
    );

  const [recipientEmail, setRecipientEmail] =
    useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadRecipientEmail() {
      try {
        const accountEmail =
          await getCurrentUserEmail();

        if (isMounted) {
          setRecipientEmail(accountEmail || "");
        }
      } catch (error) {
        console.warn(
          "Could not load signed-in user email:",
          error
        );

        if (isMounted) {
          setRecipientEmail("");
        }
      }
    }

    void loadRecipientEmail();

    return () => {
      isMounted = false;
    };
  }, []);

  const [isProcessing, setIsProcessing] =
    useState(false);

  const [nativeUploadQueued, setNativeUploadQueued] = useState(false);
  const [completionAlertToken, setCompletionAlertToken] = useState("");
  const notificationOptOut = useRef(false);
  const [notificationIssue, setNotificationIssue] = useState("");
  const [alertBusy, setAlertBusy] = useState(false);
  const backgroundTime = useRef({ total: 0, since: AppState.currentState === 'active' ? 0 : Date.now() });
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && backgroundTime.current.since) {
        backgroundTime.current.total += Date.now() - backgroundTime.current.since;
        backgroundTime.current.since = 0;
      } else if (state !== 'active' && !backgroundTime.current.since) backgroundTime.current.since = Date.now();
    });
    return () => sub.remove();
  }, []);

  async function toggleCompletionAlert() {
    if (alertBusy) return;
    setAlertBusy(true);
    try {
      const enabling = !completionAlertToken;
      const token = currentJobId
        ? await setCompletionAlert(currentJobId, enabling, completionAlertToken)
        : enabling ? await requestCompletionToken() : "";
      notificationOptOut.current = !enabling;
      setNotificationIssue("");
      setCompletionAlertToken(enabling ? token : "");
      if (recoveryRef.current) await checkpoint({ completionAlertToken: enabling ? token : "" });
    } catch (error) { Alert.alert("Completion notification", error instanceof Error ? error.message : "Could not update the alert. Analysis will continue."); }
    finally { setAlertBusy(false); }
  }

  const [jobProgress, setJobProgress] =
    useState(0);

  const [
    waitingMessageIndex,
    setWaitingMessageIndex,
  ] = useState(0);

  const processingProgressAnimation =
    useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(
      processingProgressAnimation,
      {
        toValue: Math.max(
          0,
          Math.min(jobProgress, 100),
        ),
        duration: 450,
        useNativeDriver: false,
      },
    ).start();
  }, [
    jobProgress,
    processingProgressAnimation,
  ]);


  useEffect(() => {
    if (!isProcessing) {
      setWaitingMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setWaitingMessageIndex(
        (currentIndex) =>
          (currentIndex + 1) %
          ANALYSIS_WAITING_MESSAGES.length,
      );
    }, 6500);

    return () => clearInterval(interval);
  }, [isProcessing]);

  const [jobStatusMessage, setJobStatusMessage] =
    useState(
      "Uploading photos and preparing background analysis."
    );

  const [isFinalizing, setIsFinalizing] =
    useState(false);

  const [isDiscarding, setIsDiscarding] =
    useState(false);

  const [currentJobId, setCurrentJobId] =
    useState("");

  const [results, setResults] = useState<
    RecognitionResult[]
  >([]);

  const [reviewMode, setReviewMode] = useState<
    "area" | "all"
  >("area");

  const [collapsedAreas, setCollapsedAreas] = useState<
    Record<string, boolean>
  >({});

  const [
    originalWorkbookUrl,
    setOriginalWorkbookUrl,
  ] = useState<string | null>(null);

  const [
    correctedWorkbookUrl,
    setCorrectedWorkbookUrl,
  ] = useState<string | null>(null);

  const [completedCustomer, setCompletedCustomer] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [editingIndex, setEditingIndex] = useState<
    number | null
  >(null);

  const [editDraft, setEditDraft] =
    useState<RecognitionResult | null>(null);
  const editDraftLatest = useRef<RecognitionResult | null>(null);
  editDraftLatest.current = editDraft;
  const [reviewTask, setReviewTask] = useState<string | null>(null);

  const [emailSent, setEmailSent] =
    useState(false);

  const [emailedRecipient, setEmailedRecipient] =
    useState("");

  const [sourcePhotoViewer, setSourcePhotoViewer] =
    useState<SourcePhotoViewer | null>(null);

  const [footerHeight, setFooterHeight] =
    useState(0);

  const scrollViewRef = useRef<ScrollView>(null);
  const photoViewerScrollRef =
    useRef<ScrollView>(null);
  const lastPhotoViewerTapTime = useRef(0);
  const photoViewerIsZoomed = useRef(false);
  const reviewSectionY = useRef(0);
  const resultCardPositions = useRef<Record<number, number>>({});

  useEffect(() => {
    let active = true;
    loadRecovery().then(async saved => {
      if (!active) return;
      if (saved && params.resume === "1" && saved.customerId === customerId) {
        if (Platform.OS === "web") {
          const groups = await restoreGroups(photoDraftKey);
          if (groups) saved.photos = groups.flatMap(group => group.photos.map((photo: SelectedPhoto) => ({ ...photo, location: group.name })));
          saved.prepared = [];
        }
        setPhotos(saved.photos);
        recoveryRef.current = saved;
        pendingUpload.current = { key: JSON.stringify([saved.customerName, saved.customerId, saved.photos]), prepared: saved.prepared, uploadId: saved.uploadId, uploaded: new Set(saved.uploaded) };
        setCurrentJobId(saved.jobId);
        setCompletionAlertToken(saved.completionAlertToken || "");
        setResults(saved.results.map(row => normalizeResult(row as RecognitionResult)));
        setRemovedPhotos(saved.removedPhotos || []);
        if (saved.editDraft && typeof saved.editingIndex === "number") { setEditingIndex(saved.editingIndex); setEditDraft(normalizeResult(saved.editDraft as RecognitionResult)); }
        setCompletedCustomer(saved.customerName);
        setWalkthroughName(saved.customerName);
      }
      setRecoveryReady(true);
    }).catch(error => { if (active) { setErrorMessage(String(error)); setRecoveryReady(true); } });
    apiFetch(`${API_BASE_URL}/api/diagnostics`).then(response => response.json()).then(data => { if (active && data.success) setBackendDiagnostics(data); }).catch(() => {});
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!recoveryReady || !recoveryRef.current || isProcessing || isFinalizing) return;
    const draft = { ...recoveryRef.current, results, removedPhotos, editingIndex, editDraft };
    recoveryRef.current = draft;
    void saveRecovery(draft).catch(error => setErrorMessage(`Review progress could not be saved: ${String(error)}`));
  }, [results, removedPhotos, editingIndex, editDraft, recoveryReady, isProcessing, isFinalizing]);

  async function checkpoint(overrides: Partial<RecoveryDraft> = {}) {
    const pending = pendingUpload.current;
    const draft: RecoveryDraft = { ...recoveryRef.current, version: 1, customerId, customerName: walkthroughName, contactName: selectedContactName,
      photos: recoveryRef.current?.photos || photos, prepared: pending?.prepared || [], uploadId: pending?.uploadId || "",
      uploaded: Array.from(pending?.uploaded || []), jobId: recoveryRef.current?.jobId || currentJobId,
      results: recoveryRef.current?.results || results, updatedAt: new Date().toISOString(), ...overrides };
    recoveryRef.current = draft;
    await saveRecovery(draft);
  }

  const photoCount = photos.length;
  const hasResults = results.length > 0;

  const photoOutcomes = photos.map((photo, index) => {
    const rows = results.filter(row => getSourcePhotoIndex(row.photo, photos.length) === index);
    const excluded = removedPhotos.some(key => { try { return getSourcePhotoIndex(JSON.parse(key)[0], photos.length) === index; } catch { return false; } });
    return { photo, index, rows, status: photoOutcome(rows, excluded) };
  });
  const countOutcome = (status: string) => photoOutcomes.filter(photo => photo.status === status).length;

  const reviewGroups = useMemo(() => {
    const groups = new Map<
      string,
      { location: string; items: Array<{ result: RecognitionResult; index: number }> }
    >();

    results.forEach((result, index) => {
      const location = cleanText(result.location) || "Unassigned Area";
      const existingGroup = groups.get(location);

      if (existingGroup) {
        existingGroup.items.push({ result, index });
      } else {
        groups.set(location, {
          location,
          items: [{ result, index }],
        });
      }
    });

    return Array.from(groups.values());
  }, [results]);

  function toggleAreaCollapsed(location: string) {
    setCollapsedAreas((current) => ({
      ...current,
      [location]: !current[location],
    }));
  }

  const confirmedCount = results.filter(
    (result) => result.is_confirmed
  ).length;

  const allResultsConfirmed =
    results.length > 0 &&
    confirmedCount === results.length;

  const remainingCount =
    results.length - confirmedCount;

  const firstUnconfirmedIndex = results.findIndex(
    (result) => !result.is_confirmed
  );

  const progressPercent =
    results.length > 0
      ? Math.round((confirmedCount / results.length) * 100)
      : 0;

  useEffect(() => {
    if (!currentJobId || !results.length || correctedWorkbookUrl) return;
    const timer = setTimeout(() => { void AsyncStorage.setItem(`${activeKey}:review`, JSON.stringify({ jobId: currentJobId, results, walkthroughName, recipientEmail, editingIndex, editDraft })).catch(() => {}); }, 300);
    return () => clearTimeout(timer);
  }, [results, currentJobId, correctedWorkbookUrl, activeKey, walkthroughName, recipientEmail, editingIndex, editDraft]);
  useEffect(() => {
    if (Platform.OS !== "web" || !(isProcessing || (results.length && !correctedWorkbookUrl))) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [isProcessing, results.length, correctedWorkbookUrl]);
  const resumedJob = useRef("");
  useEffect(() => {
    const saved = recoveryRef.current;
    const target = resumeJobId || (params.resume === "1" && !saved?.results.length ? saved?.jobId || saved?.nativeBatchId : "");
    if (!target || !session || !recoveryReady || resumedJob.current === target) return;
    resumedJob.current = target;
    void analyzePhotos();
  }, [resumeJobId, session?.user.id, recoveryReady]);

  function returnToPhotos() {
    if (
      isProcessing ||
      isFinalizing ||
      isDiscarding
    ) {
      Alert.alert(
        "Please wait",
        "The current operation must finish before leaving this screen."
      );
      return;
    }

    router.back();
  }

  async function analyzePhotos() {
    if (analysisBusy.current || !recoveryReady) return;
    analysisBusy.current = true;
    if (!recoveryRef.current && !resumeJobId && params.resume !== "1") {
      try {
        const saved = await loadRecovery();
        if (saved) {
          analysisBusy.current = false;
          Alert.alert("Unfinished walkthrough", "Resume your saved walkthrough, or replace its local recovery draft. Saved reports in History are kept.", [
            { text: "Cancel", style: "cancel" },
            { text: "Resume saved", onPress: () => router.replace({ pathname: "/upload", params: { resume: "1", customerId: saved.customerId, customerName: saved.customerName, contactName: saved.contactName, photos: JSON.stringify(saved.photos) } }) },
            { text: "Replace draft", style: "destructive", onPress: () => { void clearRecovery().then(() => analyzePhotos()); } },
          ]);
          return;
        }
      } catch (error) { analysisBusy.current = false; setErrorMessage(String(error)); return; }
    }
    const customer =
      walkthroughName.trim() || "Mobile Walkthrough";

    if (photoCount === 0 && !resumeJobId) {
      Alert.alert(
        "No photos received",
        "Return to the previous screen and select at least one inventory photo."
      );
      analysisBusy.current = false;
      return;
    }

    let preparedPhotos: SelectedPhoto[] = [];
    let notificationToken = completionAlertToken || recoveryRef.current?.completionAlertToken || "";

    async function uploadRequest(url: string, init: RequestInit): Promise<{
      response: Response;
      data: UploadApiResponse & { upload_id?: string };
    }> {
      for (let attempt = 0; ; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 180000);
        try {
          const response = await apiFetch(url, { ...init, signal: controller.signal });
          const data = await readJsonResponse<UploadApiResponse & { upload_id?: string }>(response);
          if (!response.ok) {
            if (response.status >= 500 && attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
              continue;
            }
            throw new Error(data.error || data.details || `Upload returned HTTP ${response.status}.`);
          }
          return { response, data };
        } catch (error) {
          // Only transient transport failures are automatically retried.
          if (attempt >= 2 || !(error instanceof TypeError ||
              (error instanceof Error && error.name === "AbortError"))) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        } finally {
          clearTimeout(timer);
        }
      }
    }

    async function submitNativeJob(): Promise<{ response: Response; data: UploadApiResponse }> {
      const id = recoveryRef.current?.nativeBatchId || newBatchId();
      const existing = recoveryRef.current?.nativeBatchId ? await serverBatchStatus(id) : null;
      if (existing?.result?.job_id) return { response: { ok: true } as Response, data: existing.result };
      await checkpoint({ nativeBatchId: id, completionAlertToken: notificationToken });
      // All file transfers and retries are queued natively. No JS "submit" call is required.
      await enqueueNativeUpload(id, preparedPhotos, {
        customer, customer_id: customerId, photo_locations: preparedPhotos.map(p => cleanText(p.location)),
        completion_token: notificationToken,
      });
      setNativeUploadQueued(true);
      while (true) {
        if (!uploadMounted.current) throw new Error("Upload continues with iOS. Resume your walkthrough to review it.");
        if (AppState.currentState === 'active') {
          const local = await nativeUploadStatus(id);
          const remote = await serverBatchStatus(id);
          if (remote?.result?.job_id) return { response: { ok: true } as Response, data: remote.result };
          if (local.error) throw new Error(local.error);
          const count = remote?.uploaded_slots?.length ?? local.uploaded?.filter(v => v !== 'metadata').length ?? 0;
          setJobStatusMessage(`${count} of ${preparedPhotos.length} photos received. You can switch apps or lock your phone.`);
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    }

    async function submitBackgroundJob(): Promise<{
      response: Response;
      data: UploadApiResponse;
    }> {
      const pending = pendingUpload.current!;
      if (!pending.uploadId) {
        const { data } = await uploadRequest(UPLOAD_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ photo_count: preparedPhotos.length }),
        });
        if (!data.upload_id) throw new Error("The server did not create an upload session.");
        pending.uploadId = data.upload_id;
        await checkpoint();
      }
      const base = `${UPLOAD_API_URL}/${pending.uploadId}`;
      const reconciledResponse = await apiFetch(base);
      const reconciled = await readJsonResponse<{ uploaded_slots?: number[]; result?: UploadApiResponse }>(reconciledResponse);
      if (!reconciledResponse.ok) throw new Error("This upload is unavailable or expired. Your local photos remain saved; start a new walkthrough when ready.");
      pending.uploaded = new Set(reconciled.uploaded_slots || []);
      if (reconciled.result?.job_id) return { response: reconciledResponse, data: reconciled.result };

      for (let index = 0; index < preparedPhotos.length; index += 1) {
        if (pending.uploaded.has(index)) continue;
        setJobStatusMessage(`Uploading photo ${index + 1} of ${preparedPhotos.length}. Keep the app open.`);
        const photo = preparedPhotos[index];
        const body = new FormData();
        if (Platform.OS === "web") {
          const source = await fetch(photo.uri);
          if (!source.ok) throw new Error("The selected photo could not be read. Select it again.");
          body.append("photo", await source.blob(), getFileName(photo, index));
        } else {
          body.append("photo", {
            uri: photo.uri, name: getFileName(photo, index), type: getMimeType(photo),
          } as unknown as Blob);
        }
        await uploadRequest(`${base}/photos/${index}`, {
          method: "POST", headers: { Accept: "application/json" }, body,
        });
        pending.uploaded.add(index);
        await checkpoint();
      }
      setJobStatusMessage("All photos uploaded. Starting analysis.");
      const body = new FormData();
      body.append("customer", customer);
      if (customerId) body.append("customer_id", customerId);
      body.append("photo_locations", JSON.stringify(preparedPhotos.map(photo => cleanText(photo.location))));
      return uploadRequest(`${base}/submit`, {
        method: "POST", headers: { Accept: "application/json" }, body,
      });
    }

    async function waitForJobCompletion(
      statusUrl: string
    ): Promise<JobStatusApiResponse> {
      const startedAt = Date.now();
      const initialBackground = backgroundTime.current.total;

      while (true) {
        if (!uploadMounted.current) throw new Error("Analysis continues in the background. Use Resume walkthrough to return.");
        if (AppState.currentState !== 'active') {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        if (Date.now() - startedAt - (backgroundTime.current.total - initialBackground) > JOB_POLL_TIMEOUT_MS) {
          throw new Error(
            "The background analysis is still running after two hours. Your upload may still finish, but this screen stopped checking it."
          );
        }

        let response: Response;
        try {
          response = await apiFetch(statusUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        } catch (error) {
          if (error instanceof Error && /session|sign in/i.test(error.message)) throw error;
          setJobStatusMessage("Connection interrupted. Your job is saved; reconnecting…");
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        if (response.status >= 500) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        const data =
          await readJsonResponse<JobStatusApiResponse>(
            response
          );

        if (!response.ok) {
          throw new Error(
            data.error ||
              data.details ||
              `The job status request returned HTTP ${response.status}.`
          );
        }

        const safeProgress = Math.max(
          0,
          Math.min(100, Number(data.progress) || 0)
        );

        if (data.diagnostics) setBackendDiagnostics(data.diagnostics);
        setJobProgress(safeProgress);
        setJobStatusMessage(
          data.message ||
            (data.status === "queued"
              ? "Waiting for the background worker."
              : "Analyzing inventory photos.")
        );

        if (data.status === "complete") {
          return data;
        }

        if (data.status === "failed" && data.results?.length) return data;
        if (data.status === "failed") {
          throw new Error(
            data.error ||
              data.details ||
              "The background analysis failed."
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, JOB_POLL_INTERVAL_MS)
        );
      }
    }

    try {
      setIsProcessing(true);
      setCurrentJobId("");
      setJobProgress(0);
      setJobStatusMessage(
        "Preparing photos for upload."
      );
      if (!recoveryRef.current?.jobId) setResults([]);
      setOriginalWorkbookUrl(null);
      setCorrectedWorkbookUrl(null);
      setCompletedCustomer("");
      setErrorMessage("");
      setEmailSent(false);
      setEmailedRecipient("");

      if (completionAlertsSupported && !notificationOptOut.current && !notificationToken && !recoveryRef.current?.nativeBatchId && !recoveryRef.current?.jobId && !resumeJobId) {
        try {
          notificationToken = await requestCompletionToken();
          setCompletionAlertToken(notificationToken);
          setNotificationIssue("");
        } catch (error) {
          setNotificationIssue(error instanceof Error ? error.message : "Notifications unavailable. Return here to view your results.");
        }
      }
      const uploadKey = JSON.stringify([customer, customerId, photos]);
      if (!(recoveryRef.current?.jobId || resumeJobId) && (!pendingUpload.current || pendingUpload.current.key !== uploadKey || !pendingUpload.current.prepared.length)) {
        const priorUpload = recoveryRef.current?.uploadId || "";
        const originals = await retainPhotos(photos, `source-${Date.now()}`);
        recoveryRef.current = { version: 1, customerId, customerName: customer, contactName: selectedContactName, photos: originals, prepared: [], uploaded: [], uploadId: "", jobId: "", results: [], updatedAt: new Date().toISOString() };
        await saveRecovery(recoveryRef.current);
        preparedPhotos = nativeUploadSupported ? originals : await retainPhotos(await preparePhotosForUpload(originals), `upload-${Date.now()}`);
        recoveryRef.current = { version: 1, customerId, customerName: customer, contactName: selectedContactName, photos: originals, prepared: preparedPhotos, uploaded: [], uploadId: priorUpload, jobId: "", results: [], updatedAt: new Date().toISOString() };
        pendingUpload.current = { key: uploadKey, prepared: preparedPhotos, uploadId: priorUpload, uploaded: new Set() };
      } else {
        preparedPhotos = pendingUpload.current?.prepared || [];
      }

      setJobStatusMessage(
        "Uploading photos to Walkthrough AI."
      );

      await checkpoint({ completionAlertToken: notificationToken });
      const existingJobId = recoveryRef.current?.jobId || resumeJobId;
      const { response, data } = existingJobId
        ? { response: { ok: true } as Response, data: { success: true, job_id: existingJobId } as UploadApiResponse }
        : await (nativeUploadSupported ? submitNativeJob() : submitBackgroundJob());

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            data.details ||
            `The server returned HTTP ${response.status}.`
        );
      }

      const jobId = cleanText(data.job_id);
      const statusUrl =
        cleanText(data.status_url) ||
        (jobId
          ? `${API_BASE_URL}/api/jobs/${jobId}`
          : "");

      if (!jobId || !statusUrl) {
        throw new Error(
          "The server accepted the upload but did not return a valid Job ID."
        );
      }

      setCurrentJobId(jobId);
      await checkpoint({ jobId, completionAlertToken: notificationToken });
      if (notificationToken) {
        try { await setCompletionAlert(jobId, true, notificationToken); }
        catch (error) { setNotificationIssue(error instanceof Error ? error.message : "Could not register completion alert. Your analysis continues."); }
      }

      setJobStatusMessage(
        data.message ||
          "Upload received. Waiting for background analysis."
      );

      const completedJob =
        await waitForJobCompletion(statusUrl);

      if (!uploadMounted.current) return;
      const recognizedResults = Array.isArray(
        completedJob.results
      )
        ? completedJob.results
            .map(normalizeResult)
            .map(applySmartConfirmation)
        : [];

      let reviewed = (recoveryRef.current?.results || []) as RecognitionResult[];
      if (!reviewed.length && resumeJobId) {
        const raw = await AsyncStorage.getItem(`${activeKey}:review`);
        if (raw) { try { const old = JSON.parse(raw); if (old.jobId === jobId) reviewed = old.results || []; } catch {} }
      }
      const preserved = mergeRecoveryResults(recognizedResults, reviewed, removedPhotos);
      setResults(preserved);
      await checkpoint({ results: preserved });
      setOriginalWorkbookUrl(
        completedJob.download_url ?? null
      );
      setCompletedCustomer(
        completedJob.customer || customer
      );
      setJobProgress(100);
      setJobStatusMessage(
        completedJob.message ||
          "Inventory analysis is complete."
      );
      setErrorMessage("");

      if (recognizedResults.length === 0) {
        setErrorMessage(
          "The upload completed, but no inventory products were identified. Try a clearer label photo."
        );
      }
    } catch (error) {
      if (!uploadMounted.current) return;
      console.warn("Background upload error:", error);

      const isAbortError =
        error instanceof Error &&
        error.name === "AbortError";

      const message = isAbortError
        ? "A photo upload timed out. Your completed uploads are saved on this screen. Press Analyze to resume; keep the app open."
        : error instanceof Error
        ? error.message
        : "Walkthrough AI could not analyze the photos.";

      setErrorMessage(message);
      Alert.alert("Analysis failed", message);
    } finally {
      setIsProcessing(false);
      analysisBusy.current = false;
    }
  }

  const retakeBusy = useRef(false);

  async function persistReviewPatch(patch: Partial<RecognitionResult>) {
    const current = editDraftLatest.current;
    if (!current) return;
    const next = { ...current, ...patch };
    editDraftLatest.current = next;
    setEditDraft(next);
    await checkpoint({ editDraft: next, editingIndex, results, removedPhotos });
  }

  function beginEditing(index: number) {
    setEditingIndex(index);
    setEditDraft({
      ...results[index],
    });
  }

  async function retryFailedPhotos() {
    if (analysisBusy.current || !currentJobId) return;
    try {
      await checkpoint({ results });
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${currentJobId}/retry-failed`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Retry could not start.");
      await analyzePhotos();
    } catch (error) { setErrorMessage(String(error)); }
  }

  function cancelEditing() {
    if (retakeBusy.current || reviewTask) { Alert.alert("Review in progress", "Wait for the current review task before closing this item."); return; }
    setEditingIndex(null);
    setEditDraft(null);
  }

  function viewSourcePhoto(
    result: RecognitionResult
  ) {
    const sourcePhotoIndex = getSourcePhotoIndex(
      result.photo,
      photos.length
    );

    if (sourcePhotoIndex === null) {
      Alert.alert(
        "Source photo unavailable",
        "Walkthrough AI could not match this result to one of the selected photos."
      );
      return;
    }

    const sourcePhoto = (recoveryRef.current?.photos || photos)[sourcePhotoIndex];

    if (!sourcePhoto?.uri) {
      Alert.alert(
        "Source photo unavailable",
        "The original photo is no longer available on this screen."
      );
      return;
    }

    setSourcePhotoViewer({
      uri: sourcePhoto.uri,
      label:
        result.photo ||
        `Photo ${sourcePhotoIndex + 1}`,
    });
    lastPhotoViewerTapTime.current = 0;
    photoViewerIsZoomed.current = false;
  }

  function handlePhotoViewerTap() {
    const currentTapTime = Date.now();
    const elapsedSinceLastTap =
      currentTapTime -
      lastPhotoViewerTapTime.current;

    lastPhotoViewerTapTime.current =
      currentTapTime;

    if (
      elapsedSinceLastTap <= 0 ||
      elapsedSinceLastTap > 320
    ) {
      return;
    }

    lastPhotoViewerTapTime.current = 0;

    const shouldZoomIn =
      !photoViewerIsZoomed.current;
    const zoomScale = shouldZoomIn ? 2.5 : 1;
    const targetWidth =
      windowWidth / zoomScale;
    const targetHeight =
      photoViewerImageHeight / zoomScale;

    photoViewerScrollRef.current?.scrollResponderZoomTo(
      {
        x: shouldZoomIn
          ? (windowWidth - targetWidth) / 2
          : 0,
        y: shouldZoomIn
          ? (photoViewerImageHeight - targetHeight) /
            2
          : 0,
        width: targetWidth,
        height: targetHeight,
        animated: true,
      }
    );

    photoViewerIsZoomed.current = shouldZoomIn;
  }

  function requestRemoveEditedResult() {
    if (editingIndex === null || !editDraft) {
      return;
    }

    const resultIndex = editingIndex;
    const resultName =
      cleanText(editDraft.manufacturer_part_number) ||
      cleanText(editDraft.vendor_part_number) ||
      cleanText(editDraft.part_number) ||
      cleanText(editDraft.description) ||
      `Item ${resultIndex + 1}`;

    Alert.alert(
      "Remove false result?",
      `${resultName} will be removed from this walkthrough and will not appear in the finalized report.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove Result",
          style: "destructive",
          onPress: () => {
            setRemovedPhotos(current => [...current, resultKey(editDraft)]);
            setResults((currentResults) =>
              currentResults.filter(
                (_result, index) =>
                  index !== resultIndex
              )
            );

            setCorrectedWorkbookUrl(null);
            setEmailSent(false);
            setEmailedRecipient("");
            cancelEditing();
          },
        },
      ]
    );
  }

  function updateDraft(
    field: keyof RecognitionResult,
    value: string
  ) {
    setEditDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        [field]: value,
      };
    });
  }

  function saveEditedResult(andNext = false) {
    if (editingIndex === null || !editDraft) {
      return;
    }

    if (retakeBusy.current || reviewTask) { Alert.alert("Review in progress", "Wait for the current review task before saving this item."); return; }

    const finalPartNumber =
      cleanText(editDraft.part_number);

    const updatedResult: RecognitionResult = {
      ...editDraft,
      location: cleanText(editDraft.location),
      vendor: cleanText(editDraft.vendor),
      manufacturer: cleanText(
        editDraft.manufacturer
      ),
      manufacturer_part_number: cleanText(
        editDraft.manufacturer_part_number
      ),
      vendor_part_number: cleanText(
        editDraft.vendor_part_number
      ),
      part_number: finalPartNumber,
      description: cleanText(
        editDraft.description
      ),
      size_specification: cleanText(
        editDraft.size_specification
      ),
      package_quantity: cleanText(
        editDraft.package_quantity
      ),
      label_text: cleanText(
        editDraft.label_text
      ),
      notes: cleanText(editDraft.notes),
      was_edited: true,
      is_confirmed: true,
      review_needed: false,
    };

    setResults((currentResults) =>
      currentResults.map((result, index) =>
        index === editingIndex
          ? updatedResult
          : result
      )
    );

    setCorrectedWorkbookUrl(null);
    setEmailSent(false);
    setEmailedRecipient("");

    if (andNext) {
      const nextIndex = results.findIndex((result, index) => index > editingIndex && !result.is_confirmed && (result.review_needed || getReviewReasons(result).length > 0));
      const wrapped = nextIndex >= 0 ? nextIndex : results.findIndex((result, index) => index !== editingIndex && !result.is_confirmed && (result.review_needed || getReviewReasons(result).length > 0));
      if (wrapped >= 0) { beginEditing(wrapped); return; }
    }
    cancelEditing();
  }

  function scrollToResult(index: number) {
    const cardY = resultCardPositions.current[index];

    if (typeof cardY === "number") {
      scrollViewRef.current?.scrollTo({
        y: Math.max(cardY - 150, 0),
        animated: true,
      });
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(reviewSectionY.current - 24, 0),
      animated: true,
    });
  }

  function toggleConfirmed(index: number) {
    const wasConfirmed = Boolean(results[index]?.is_confirmed);

    setResults((currentResults) =>
      currentResults.map((result, resultIndex) => {
        if (resultIndex !== index) {
          return result;
        }

        const nextConfirmed =
          !result.is_confirmed;

        return {
          ...result,
          is_confirmed: nextConfirmed,
          review_needed: !nextConfirmed,
        };
      })
    );

    setCorrectedWorkbookUrl(null);
    setEmailSent(false);
    setEmailedRecipient("");

    if (!wasConfirmed) {
      const nextIndex = results.findIndex(
        (result, resultIndex) =>
          resultIndex > index && !result.is_confirmed
      );

      if (nextIndex >= 0) {
        setTimeout(() => scrollToResult(nextIndex), 180);
      }
    }
  }

  function confirmAllResults() {
    setResults((currentResults) =>
      currentResults.map((result) => ({
        ...result,
        is_confirmed: true,
        review_needed: false,
      }))
    );

    setCorrectedWorkbookUrl(null);
    setEmailSent(false);
    setEmailedRecipient("");
  }

  function jumpToFirstUnconfirmed() {
    if (firstUnconfirmedIndex < 0) {
      Alert.alert(
        "Review complete",
        "Every inventory item has been confirmed."
      );
      return;
    }

    scrollToResult(firstUnconfirmedIndex);
  }

  function confirmNextItem() {
    if (firstUnconfirmedIndex < 0) {
      return;
    }

    const confirmedIndex = firstUnconfirmedIndex;

    setResults((currentResults) =>
      currentResults.map((result, index) =>
        index === confirmedIndex
          ? {
              ...result,
              is_confirmed: true,
              review_needed: false,
            }
          : result
      )
    );

    setCorrectedWorkbookUrl(null);
    setEmailSent(false);
    setEmailedRecipient("");

    const nextIndex = results.findIndex(
      (result, index) =>
        index > confirmedIndex && !result.is_confirmed
    );

    if (nextIndex >= 0) {
      setTimeout(() => scrollToResult(nextIndex), 180);
    }
  }

  async function finalizeWalkthrough(
    sendEmail: boolean
  ): Promise<string | null> {
    const cleanedRecipient =
      recipientEmail.trim();

    if (sendEmail && !cleanedRecipient) {
      Alert.alert(
        "Account email unavailable",
        "WalkthroughAI could not load your signed-in account email. Return to Account and confirm your sign-in email before emailing the report."
      );
      return null;
    }

    if (
      sendEmail &&
      !isValidEmail(cleanedRecipient)
    ) {
      Alert.alert(
        "Invalid email address",
        "Enter a complete email address, such as name@example.com."
      );
      return null;
    }

    try {
      setIsFinalizing(true);
      setErrorMessage("");

      const response = await apiFetch(
        FINALIZE_API_URL,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer:
              completedCustomer ||
              walkthroughName.trim() ||
              "Mobile Walkthrough",
            customer_id: customerId || null,
            contact_name: selectedContactName || null,
            recipient_email: sendEmail
              ? cleanedRecipient
              : null,
            send_email: sendEmail,
            job_id: currentJobId || null,
            results,
          }),
        }
      );

      const data =
        await readJsonResponse<FinalizeApiResponse>(
          response
        );

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            data.details ||
            `The server returned HTTP ${response.status}.`
        );
      }

      const finalizedResults = Array.isArray(
        data.results
      )
        ? data.results.map(normalizeResult)
        : results;

      setResults(finalizedResults);
      recoveryRef.current = null;
      await clearRecovery();

      setCorrectedWorkbookUrl(data.download_url ?? null);
      await AsyncStorage.multiRemove([activeKey, `${activeKey}:review`]).catch(() => {});
      await writeDraft(photoDraftKey, null).catch(() => {});

      if (sendEmail && data.email_sent) {
        setEmailSent(true);
        setEmailedRecipient(
          data.recipient_email ||
            cleanedRecipient
        );

        Alert.alert(
          "Workbook emailed",
          `The corrected workbook was sent to ${
            data.recipient_email ||
            cleanedRecipient
          }.`,
          [
            {
              text: "Done",
              onPress: () => {
                router.replace("/");
              },
            },
            {
              text: "Open Workbook",
              onPress: async () => {
                if (data.download_url) {
                  await openDownloadAddress(
                    data.download_url
                  );
                }
              },
            },
          ]
        );
      } else if (sendEmail) {
        setEmailSent(false);
        setEmailedRecipient("");

        Alert.alert(
          "Email not sent",
          "The report is ready, but the email could not be delivered. You can open the report now or try emailing it again later.",
          [
            {
              text: "OK",
              style: "cancel",
            },
            {
              text: "Open Report",
              onPress: async () => {
                if (data.download_url) {
                  await openDownloadAddress(
                    data.download_url
                  );
                }
              },
            },
          ]
        );
      } else {
        setEmailSent(false);
        setEmailedRecipient("");
      }

      return data.download_url ?? null;
    } catch (error) {
      console.error(
        "Finalize walkthrough error:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : sendEmail
            ? "The corrected workbook could not be finalized or emailed."
            : "The corrected workbook could not be finalized.";

      setErrorMessage(message);

      Alert.alert(
        error instanceof Error && error.name === "FinalizationPendingError"
          ? "Save status not confirmed" : "Finalization failed",
        message
      );

      return null;
    } finally {
      setIsFinalizing(false);
    }
  }

  function finishWithReviewItems() {
    if (remainingCount <= 0 || isFinalizing || isDiscarding) {
      return;
    }

    Alert.alert(
      "Finish with review items?",
      `${remainingCount} ${
        remainingCount === 1 ? "item is" : "items are"
      } still unconfirmed. ${
        remainingCount === 1 ? "It" : "They"
      } will be saved to Review Items so you can resolve ${
        remainingCount === 1 ? "it" : "them"
      } later.`,
      [
        {
          text: "Keep Reviewing",
          style: "cancel",
        },
        {
          text: "Finish Walkthrough",
          onPress: () => {
            void finalizeWalkthrough(false);
          },
        },
      ]
    );
  }

  async function discardWalkthrough() {
    if (!currentJobId) {
      Alert.alert(
        "Cannot discard results",
        "The original analysis Job ID is unavailable. Return home without publishing, then try another walkthrough."
      );
      return;
    }

    try {
      setIsDiscarding(true);
      setErrorMessage("");

      const response = await apiFetch(
        `${API_BASE_URL}/api/jobs/${encodeURIComponent(
          currentJobId
        )}/discard`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "Cancelled from mobile review",
          }),
        }
      );

      const data =
        await readJsonResponse<DiscardApiResponse>(
          response
        );

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            data.details ||
            `The server returned HTTP ${response.status}.`
        );
      }

      recoveryRef.current = null;
      await clearRecovery();
      await AsyncStorage.multiRemove([activeKey, `${activeKey}:review`]).catch(() => {});
      await writeDraft(photoDraftKey, null).catch(() => {});
      setResults([]);
      setCorrectedWorkbookUrl(null);
      setEmailSent(false);
      setEmailedRecipient("");
      router.replace("/");
    } catch (error) {
      console.error(
        "Discard walkthrough error:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "The results could not be discarded.";

      setErrorMessage(message);

      Alert.alert(
        "Discard failed",
        `${message} Nothing was published or emailed.`
      );
    } finally {
      setIsDiscarding(false);
    }
  }

  function confirmDiscardWalkthrough() {
    if (isProcessing || isFinalizing || isDiscarding) {
      return;
    }

    Alert.alert(
      "Don’t publish results",
      "Discard these results and return home?",
      [
        {
          text: "Keep Reviewing",
          style: "cancel",
        },
        {
          text: "Discard Results",
          style: "destructive",
          onPress: () => {
            void discardWalkthrough();
          },
        },
      ]
    );
  }

  async function openDownloadAddress(
    url: string
  ) {
    try {
      const supported =
        await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert(
          "Cannot open workbook",
          "Your phone could not open the Excel download address."
        );
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      console.error(
        "Workbook opening error:",
        error
      );

      Alert.alert(
        "Cannot open workbook",
        "The Excel workbook could not be opened."
      );
    }
  }

  async function viewReportImmediately() {
    if (correctedWorkbookUrl) {
      await openDownloadAddress(correctedWorkbookUrl);
      return;
    }

    const downloadUrl =
      await finalizeWalkthrough(false);

    if (downloadUrl) {
      await openDownloadAddress(downloadUrl);
    }
  }

  async function openCorrectedWorkbook() {
    if (!correctedWorkbookUrl) {
      Alert.alert(
        "Corrected workbook unavailable",
        "Finalize the confirmed results first."
      );
      return;
    }

    await openDownloadAddress(
      correctedWorkbookUrl
    );
  }

  async function openOriginalWorkbook() {
    if (!originalWorkbookUrl) {
      Alert.alert(
        "Original workbook unavailable",
        "No original AI workbook link was returned."
      );
      return;
    }

    await openDownloadAddress(
      originalWorkbookUrl
    );
  }

  function startOver() {
    if (
      isProcessing ||
      isFinalizing ||
      isDiscarding
    ) {
      return;
    }

    router.replace("/");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            disabled={
              isProcessing ||
              isFinalizing ||
              isDiscarding
            }
            onPress={returnToPhotos}
            style={({ pressed }) => [
              styles.backButton,
              pressed &&
                !isProcessing &&
                !isFinalizing &&
                !isDiscarding &&
                styles.buttonPressed,
              (isProcessing ||
                isFinalizing ||
                isDiscarding) &&
                styles.disabledButton,
            ]}
          >
            <Text style={styles.backArrow}>
              ←
            </Text>

            <Text style={styles.backText}>
              Back
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom:
                footerHeight > 0
                  ? footerHeight + 24
                  : 280,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!hasResults && !isProcessing && (
            <>
              <View style={styles.uploadCard}>
                <View
                  style={
                    styles.uploadIconContainer
                  }
                >
                  <Text style={styles.uploadIcon}>
                    ☁️
                  </Text>

                  <Text style={styles.uploadArrow}>
                    ↑
                  </Text>
                </View>

                <Text style={styles.title}>
                  {photoCount > 0
                    ? "Ready for Recognition"
                    : "No Photos Received"}
                </Text>

                <Text style={styles.description}>
                  {photoCount > 0
                    ? `${photoCount} ${
                        photoCount === 1
                          ? "photo is"
                          : "photos are"
                      } ready to be analyzed.`
                    : "Return to the photo screen and select at least one image."}
                </Text>
              </View>

              <View style={styles.nameSection}>
                <Text style={styles.nameLabel}>
                  Selected customer
                </Text>

                <TextInput
                  value={walkthroughName}
                  onChangeText={
                    setWalkthroughName
                  }
                  editable={false}
                  placeholder="Select a customer first"
                  placeholderTextColor="#64758B"
                  autoCapitalize="words"
                  style={[
                    styles.nameInput,
                    styles.nameInputDisabled,
                  ]}
                />

                {selectedContactName ? (
                  <Text style={styles.selectedCustomerDetail}>
                    Contact: {selectedContactName}
                  </Text>
                ) : null}
              </View>

              {photoCount > 0 && (
                <View
                  style={styles.previewSection}
                >
                  <View
                    style={styles.previewHeader}
                  >
                    <View
                      style={
                        styles.previewHeaderText
                      }
                    >
                      <Text
                        style={styles.previewTitle}
                      >
                        Photos to Analyze
                      </Text>

                      <Text
                        style={
                          styles.previewSubtitle
                        }
                      >
                        Check that every label is
                        readable.
                      </Text>
                    </View>

                    <View
                      style={styles.countBadge}
                    >
                      <Text
                        style={
                          styles.countBadgeText
                        }
                      >
                        {photoCount}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.photoGrid}>
                    {photos.map(
                      (photo, index) => (
                        <View
                          key={photo.id}
                          style={
                            styles.photoCard
                          }
                        >
                          <Image
                            source={{
                              uri: photo.uri,
                            }}
                            style={
                              styles.photoImage
                            }
                            resizeMode="cover"
                          />

                          <View
                            style={
                              styles.photoOverlay
                            }
                          >
                            <Text
                              style={
                                styles.photoNumber
                              }
                            >
                              Photo {index + 1}
                            </Text>
                          </View>
                        </View>
                      )
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          {isProcessing && (
            <View style={styles.processingCard}>
              <ActivityIndicator
                size="large"
                color="#64B5FF"
              />

              <Text
                style={styles.processingTitle}
              >
                {currentJobId ? "Analyzing inventory" : "Uploading photos"}
              </Text>

              <Text
                style={
                  styles.processingMessageHeading
                }
              >
                {
                  ANALYSIS_WAITING_MESSAGES[
                    waitingMessageIndex
                  ].heading
                }
              </Text>

              <Text
                style={styles.processingText}
              >
                {
                  ANALYSIS_WAITING_MESSAGES[
                    waitingMessageIndex
                  ].text
                }
              </Text>

              <Text
                style={styles.processingNote}
              >
                {currentJobId ? `${jobProgress}% analyzed` : jobStatusMessage}
              </Text>

              <Text style={styles.processingNote}>{currentJobId
                ? "Your photos are uploaded. Analysis continues on the server if you lock your phone or switch apps. Return here to review the results."
                : nativeUploadQueued ? "iOS is uploading your photos. You can switch apps or lock your phone. Analysis starts automatically after every photo arrives. Do not swipe the app closed." : nativeUploadSupported ? "Preparing the iOS upload queue. Transfers continue when you switch apps once queued." : "Keep the app open until all photos finish uploading. Install the latest TestFlight build for background uploads."}</Text>
              {notificationIssue ? <Text style={{ color: "#FCD34D", padding: 12 }}>{notificationIssue}</Text> : null}
              {currentJobId && completionAlertsSupported && <Pressable accessibilityRole="button" disabled={alertBusy} onPress={() => void toggleCompletionAlert()} style={{ padding: 14, marginTop: 10 }}>
                <Text style={{ color: "#93C5FD", fontWeight: "700", textAlign: "center" }}>{alertBusy ? "Updating notification…" : completionAlertToken ? "Completion notification on · Turn off" : "Notify me when analysis finishes"}</Text>
              </Pressable>}
              {(currentJobId || nativeUploadQueued) && <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={{ padding: 14 }}>
                <Text style={{ color: "#BFDBFE", textAlign: "center" }}>Continue in background</Text>
              </Pressable>}

              <View
                style={
                  styles.processingProgressTrack
                }
              >
                <Animated.View
                  style={[
                    styles.processingProgressFill,
                    {
                      width:
                        processingProgressAnimation.interpolate(
                          {
                            inputRange: [0, 100],
                            outputRange: [
                              "0%",
                              "100%",
                            ],
                            extrapolate: "clamp",
                          },
                        ),
                    },
                  ]}
                />
              </View>

              <View
                style={
                  styles.processingProgressLabels
                }
              >
                <Text
                  style={
                    styles.processingProgressLabel
                  }
                >
                  0%
                </Text>

                <Text
                  style={
                    styles.processingProgressLabel
                  }
                >
                  100%
                </Text>
              </View>

              <Text
                style={
                  styles.processingKeepOpenText
                }
              >
                Keep this screen open while the app
                checks the background job.
              </Text>
            </View>
          )}

          {isFinalizing && (
            <View style={styles.processingCard}>
              <ActivityIndicator
                size="large"
                color="#47D39A"
              />

              <Text
                style={styles.processingTitle}
              >
                Finalizing workbook
              </Text>

              <Text
                style={styles.processingText}
              >
                The corrected Excel workbook is
                being created and emailed.
              </Text>

              <Text
                style={styles.processingNote}
              >
                Please keep this screen open.
              </Text>
            </View>
          )}

          {!isProcessing &&
            !isFinalizing &&
            errorMessage && (
              <View style={styles.errorCard}>
                <Text style={styles.errorIcon}>
                  !
                </Text>

                <View
                  style={
                    styles.errorTextContainer
                  }
                >
                  <Text
                    style={styles.errorTitle}
                  >
                    Attention needed
                  </Text>

                  <Text
                    style={styles.errorText}
                  >
                    {errorMessage}
                  </Text>
                </View>
              </View>
            )}

          {hasResults &&
            !isProcessing &&
            !isFinalizing && (
              <View style={styles.resultsSection}>
                {!allResultsConfirmed ? (
                  <>
                    <View style={styles.completedCard}>
                      <View style={styles.completedIcon}>
                        <Text style={styles.completedIconText}>✓</Text>
                      </View>

                      <Text style={styles.completedTitle}>
                        Analysis finished · review required
                      </Text>

                      <Text style={styles.completedText}>
                        {results.length} inventory{" "}
                        {results.length === 1
                          ? "result was"
                          : "results were"}{" "}
                        identified for{" "}
                        {completedCustomer || "Mobile Walkthrough"}.
                      </Text>
                    </View>

                    <View style={styles.reviewProgressCard}>
                      <Text style={styles.reviewProgressTitle}>Photo accounting</Text>
                      <Text style={styles.reviewProgressText}>{photoCount} submitted · {countOutcome("Ready to review")} ready · {countOutcome("Confirmed")} confirmed · {countOutcome("Needs retake / review")} need retake/review · {countOutcome("Failed / missing")} failed/missing · {countOutcome("Excluded after review")} excluded</Text>
                      {(showPhotoDetails ? photoOutcomes : photoOutcomes.slice(0, 3)).map(({ photo, index, rows, status }) => {
                        const failed = status === "Failed / missing";
                        return <Pressable key={photo.id} accessibilityRole="button" onPress={() => rows[0] ? beginEditing(results.indexOf(rows[0])) : Alert.alert("Missing result", "Retry failed photos, or select this photo again.")}>
                          <Text style={[styles.reviewProgressText, { color: failed ? "#FCA5A5" : "#CBD5E1", paddingVertical: 5 }]}>Photo {index + 1} · {status}</Text>
                        </Pressable>;
                      })}
                      <Pressable accessibilityRole="button" onPress={() => setShowPhotoDetails(value => !value)}><Text style={{ color: "#60A5FA", paddingVertical: 8 }}>{showPhotoDetails ? "Collapse photo details" : "View every photo"}</Text></Pressable>
                      <Pressable accessibilityRole="button" disabled={isProcessing} onPress={() => void retryFailedPhotos()}><Text style={{ color: "#60A5FA", paddingVertical: 12 }}>Retry failed photos only</Text></Pressable>
                    </View>
                    <Text selectable style={{ color: "#94A3B8", fontSize: 12, marginBottom: 12 }}>App {Constants.expoConfig?.version || "unknown"} · Release {backendDiagnostics.release || "unavailable"} · Backend {backendDiagnostics.backend_commit?.slice(0, 7) || "unknown"} · Reader {backendDiagnostics.reader || "unknown"}</Text>
                    <View style={styles.aiDisclaimerCard}>
                      <Text style={styles.aiDisclaimerIcon}>i</Text>

                      <Text style={styles.aiDisclaimerText}>
                        Confirm items you trust, or finish with unresolved items saved for later review.
                      </Text>
                    </View>

                    <View style={styles.reviewProgressCard}>
                      <View style={styles.reviewProgressHeader}>
                        <View>
                          <Text style={styles.reviewProgressTitle}>
                            Review progress
                          </Text>

                          <Text style={styles.reviewProgressText}>
                            {confirmedCount} of {results.length} items confirmed
                          </Text>
                        </View>

                        <View style={styles.progressBadge}>
                          <Text style={styles.progressBadgeText}>
                            {confirmedCount}/{results.length}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${progressPercent}%` },
                          ]}
                        />
                      </View>

                      <View style={styles.reviewQuickActions}>
                        <Pressable
                          onPress={jumpToFirstUnconfirmed}
                          style={({ pressed }) => [
                            styles.jumpButton,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.jumpButtonText}>
                            Jump to First Unconfirmed
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={confirmAllResults}
                          style={({ pressed }) => [
                            styles.confirmAllButton,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.confirmAllButtonText}>
                            Confirm All
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.readySummaryCard}>
                    <View style={styles.readySummaryCheck}>
                      <Text style={styles.readySummaryCheckText}>✓</Text>
                    </View>

                    <View style={styles.readySummaryTextArea}>
                      <Text style={styles.readySummaryTitle}>
                        {results.length} {results.length === 1 ? "item" : "items"} ready
                      </Text>

                      <Text style={styles.readySummarySubtitle}>
                        {completedCustomer || "Mobile Walkthrough"}
                      </Text>
                    </View>
                  </View>
                )}

                <View
                  onLayout={(event) => {
                    reviewSectionY.current =
                      event.nativeEvent.layout.y;
                  }}
                  style={styles.resultsHeader}
                >
                  <View>
                    <Text style={styles.resultsTitle}>
                      Review Results
                    </Text>
                    <Text style={styles.resultsSubtitle}>
                      {reviewMode === "area"
                        ? `${reviewGroups.length} ${reviewGroups.length === 1 ? "area" : "areas"}`
                        : `${results.length} ${results.length === 1 ? "item" : "items"}`}
                    </Text>
                  </View>

                  <View style={styles.reviewModeToggle}>
                    <Pressable
                      onPress={() => setReviewMode("area")}
                      style={[
                        styles.reviewModeOption,
                        reviewMode === "area" && styles.reviewModeOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.reviewModeText,
                          reviewMode === "area" && styles.reviewModeTextActive,
                        ]}
                      >
                        By Area
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setReviewMode("all")}
                      style={[
                        styles.reviewModeOption,
                        reviewMode === "all" && styles.reviewModeOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.reviewModeText,
                          reviewMode === "all" && styles.reviewModeTextActive,
                        ]}
                      >
                        All
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {reviewMode === "area"
                  ? reviewGroups.map((group) => {
                      const isCollapsed = Boolean(collapsedAreas[group.location]);
                      const confirmedInArea = group.items.filter(
                        ({ result }) => result.is_confirmed
                      ).length;

                      return (
                        <View key={group.location} style={styles.areaReviewSection}>
                          <Pressable
                            onPress={() => toggleAreaCollapsed(group.location)}
                            style={({ pressed }) => [
                              styles.areaReviewHeader,
                              pressed && styles.buttonPressed,
                            ]}
                          >
                            <View style={styles.areaReviewTitleRow}>
                              <View style={styles.areaIcon}>
                                <Text style={styles.areaIconText}>⌖</Text>
                              </View>
                              <View style={styles.areaReviewTitleContainer}>
                                <Text style={styles.areaReviewTitle}>
                                  {group.location}
                                </Text>
                                <Text style={styles.areaReviewMeta}>
                                  {group.items.length} {group.items.length === 1 ? "item" : "items"} · {confirmedInArea} confirmed
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.areaChevron}>
                              {isCollapsed ? "+" : "−"}
                            </Text>
                          </Pressable>

                          {!isCollapsed && (
                            <View style={styles.areaReviewItems}>
                {group.items.map(
                  ({ result, index }) => {
                    const confidence =
                      getConfidencePercent(
                        result.confidence
                      );

                    const displayedPartNumber =
                      result.manufacturer_part_number ||
                      result.part_number;

                    const reviewReasons = getReviewReasons(result);
                    const part = cleanText(result.manufacturer_part_number || result.part_number || result.vendor_part_number).toUpperCase();
                    if (part && results.some(other => other !== result && cleanText(other.manufacturer_part_number || other.part_number || other.vendor_part_number).toUpperCase() === part && cleanText(other.location).toUpperCase() === cleanText(result.location).toUpperCase())) reviewReasons.push("Possible repeated part in this area. Compare labels before removing a duplicate. Package size is not a stock count.");

                    return (
                      <View
                        key={`${result.photo}-${index}`}
                        onLayout={(event) => {
                          resultCardPositions.current[index] =
                            event.nativeEvent.layout.y +
                            reviewSectionY.current;
                        }}
                        style={[
                          styles.resultCard,
                          !result.is_confirmed &&
                            styles.resultCardNeedsReview,
                          result.is_confirmed &&
                            styles.resultCardConfirmed,
                        ]}
                      >
                        <View
                          style={
                            styles.resultCardHeader
                          }
                        >
                          <View
                            style={
                              styles.resultNumber
                            }
                          >
                            <Text
                              style={
                                styles.resultNumberText
                              }
                            >
                              {index + 1}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.resultHeaderTextContainer
                            }
                          >
                            <Text
                              style={
                                styles.resultCardTitle
                              }
                            >
                              {result.description ||
                                displayedPartNumber ||
                                result.vendor ||
                                "Inventory item"}
                            </Text>

                            <Text
                              style={
                                styles.resultPhotoName
                              }
                            >
                              {result.photo ||
                                `Photo ${
                                  index + 1
                                }`}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.badgeColumn
                            }
                          >
                            {result.was_edited && (
                              <View
                                style={
                                  styles.editedBadge
                                }
                              >
                                <Text
                                  style={
                                    styles.editedBadgeText
                                  }
                                >
                                  Edited
                                </Text>
                              </View>
                            )}

                            <View
                              style={[
                                styles.reviewBadge,
                                result.is_confirmed
                                  ? styles.reviewBadgeReady
                                  : styles.reviewBadgeNeeded,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.reviewBadgeText,
                                  result.is_confirmed
                                    ? styles.reviewBadgeTextReady
                                    : styles.reviewBadgeTextNeeded,
                                ]}
                              >
                                {result.is_confirmed
                                  ? "Confirmed"
                                  : "Review"}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {!result.is_confirmed &&
                          reviewReasons.length > 0 && (
                            <View
                              style={
                                styles.reviewReasonCard
                              }
                            >
                              <Text
                                style={
                                  styles.reviewReasonTitle
                                }
                              >
                                Why this item needs review
                              </Text>

                              {reviewReasons.map(
                                (reason) => (
                                  <View
                                    key={reason}
                                    style={
                                      styles.reviewReasonRow
                                    }
                                  >
                                    <Text
                                      style={
                                        styles.reviewReasonBullet
                                      }
                                    >
                                      •
                                    </Text>

                                    <Text
                                      style={
                                        styles.reviewReasonText
                                      }
                                    >
                                      {reason}
                                    </Text>
                                  </View>
                                )
                              )}
                            </View>
                          )}

                        <ResultField
                          label="Location"
                          value={result.location}
                        />

                        <ResultField
                          label="Vendor"
                          value={result.vendor}
                        />

                        <ResultField
                          label="Manufacturer"
                          value={
                            result.manufacturer
                          }
                        />

                        <ResultField
                          label="Manufacturer part number"
                          value={
                            displayedPartNumber
                          }
                        />

                        <ResultField
                          label="Vendor part number"
                          value={
                            result.vendor_part_number
                          }
                        />

                        <ResultField
                          label="Description"
                          value={
                            result.description
                          }
                        />

                        <ResultField
                          label="Size or specification"
                          value={
                            result.size_specification
                          }
                        />

                        <ResultField
                          label="Package quantity"
                          value={
                            result.package_quantity
                          }
                        />

                        <View
                          style={
                            styles.confidenceSection
                          }
                        >
                          <View
                            style={
                              styles.confidenceHeader
                            }
                          >
                            <Text
                              style={
                                styles.resultFieldLabel
                              }
                            >
                              AI confidence
                            </Text>

                            <Text
                              style={
                                styles.confidenceValue
                              }
                            >
                              {confidence}%
                            </Text>
                          </View>

                          <View
                            style={
                              styles.confidenceTrack
                            }
                          >
                            <View
                              style={[
                                styles.confidenceFill,
                                {
                                  width: `${confidence}%`,
                                },
                              ]}
                            />
                          </View>
                        </View>

                        <View
                          style={
                            styles.resultActionsRow
                          }
                        >
                          <Pressable
                            onPress={() =>
                              viewSourcePhoto(
                                result
                              )
                            }
                            style={({
                              pressed,
                            }) => [
                              styles.photoButton,
                              pressed &&
                                styles.buttonPressed,
                            ]}
                          >
                            <Text
                              style={
                                styles.photoButtonText
                              }
                            >
                              Photo
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() =>
                              beginEditing(index)
                            }
                            style={({
                              pressed,
                            }) => [
                              styles.editButton,
                              pressed &&
                                styles.buttonPressed,
                            ]}
                          >
                            <Text
                              style={
                                styles.editButtonText
                              }
                            >
                              Edit Item
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() =>
                              toggleConfirmed(
                                index
                              )
                            }
                            style={({
                              pressed,
                            }) => [
                              styles.confirmButton,
                              result.is_confirmed &&
                                styles.unconfirmButton,
                              pressed &&
                                styles.buttonPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.confirmButtonText,
                                result.is_confirmed &&
                                  styles.unconfirmButtonText,
                              ]}
                            >
                              {result.is_confirmed
                                ? "Mark Unreviewed"
                                : "Confirm Correct"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  }
                )}
                            </View>
                          )}
                        </View>
                      );
                    })
                  : results.map(
                  (result, index) => {
                    const confidence =
                      getConfidencePercent(
                        result.confidence
                      );

                    const displayedPartNumber =
                      result.manufacturer_part_number ||
                      result.part_number;

                    const reviewReasons = getReviewReasons(result);
                    const part = cleanText(result.manufacturer_part_number || result.part_number || result.vendor_part_number).toUpperCase();
                    if (part && results.some(other => other !== result && cleanText(other.manufacturer_part_number || other.part_number || other.vendor_part_number).toUpperCase() === part && cleanText(other.location).toUpperCase() === cleanText(result.location).toUpperCase())) reviewReasons.push("Possible repeated part in this area. Compare labels before removing a duplicate. Package size is not a stock count.");

                    return (
                      <View
                        key={`${result.photo}-${index}`}
                        onLayout={(event) => {
                          resultCardPositions.current[index] =
                            event.nativeEvent.layout.y +
                            reviewSectionY.current;
                        }}
                        style={[
                          styles.resultCard,
                          !result.is_confirmed &&
                            styles.resultCardNeedsReview,
                          result.is_confirmed &&
                            styles.resultCardConfirmed,
                        ]}
                      >
                        <View
                          style={
                            styles.resultCardHeader
                          }
                        >
                          <View
                            style={
                              styles.resultNumber
                            }
                          >
                            <Text
                              style={
                                styles.resultNumberText
                              }
                            >
                              {index + 1}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.resultHeaderTextContainer
                            }
                          >
                            <Text
                              style={
                                styles.resultCardTitle
                              }
                            >
                              {result.description ||
                                displayedPartNumber ||
                                result.vendor ||
                                "Inventory item"}
                            </Text>

                            <Text
                              style={
                                styles.resultPhotoName
                              }
                            >
                              {result.photo ||
                                `Photo ${
                                  index + 1
                                }`}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.badgeColumn
                            }
                          >
                            {result.was_edited && (
                              <View
                                style={
                                  styles.editedBadge
                                }
                              >
                                <Text
                                  style={
                                    styles.editedBadgeText
                                  }
                                >
                                  Edited
                                </Text>
                              </View>
                            )}

                            <View
                              style={[
                                styles.reviewBadge,
                                result.is_confirmed
                                  ? styles.reviewBadgeReady
                                  : styles.reviewBadgeNeeded,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.reviewBadgeText,
                                  result.is_confirmed
                                    ? styles.reviewBadgeTextReady
                                    : styles.reviewBadgeTextNeeded,
                                ]}
                              >
                                {result.is_confirmed
                                  ? "Confirmed"
                                  : "Review"}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {!result.is_confirmed &&
                          reviewReasons.length > 0 && (
                            <View
                              style={
                                styles.reviewReasonCard
                              }
                            >
                              <Text
                                style={
                                  styles.reviewReasonTitle
                                }
                              >
                                Why this item needs review
                              </Text>

                              {reviewReasons.map(
                                (reason) => (
                                  <View
                                    key={reason}
                                    style={
                                      styles.reviewReasonRow
                                    }
                                  >
                                    <Text
                                      style={
                                        styles.reviewReasonBullet
                                      }
                                    >
                                      •
                                    </Text>

                                    <Text
                                      style={
                                        styles.reviewReasonText
                                      }
                                    >
                                      {reason}
                                    </Text>
                                  </View>
                                )
                              )}
                            </View>
                          )}

                        <ResultField
                          label="Location"
                          value={result.location}
                        />

                        <ResultField
                          label="Vendor"
                          value={result.vendor}
                        />

                        <ResultField
                          label="Manufacturer"
                          value={
                            result.manufacturer
                          }
                        />

                        <ResultField
                          label="Manufacturer part number"
                          value={
                            displayedPartNumber
                          }
                        />

                        <ResultField
                          label="Vendor part number"
                          value={
                            result.vendor_part_number
                          }
                        />

                        <ResultField
                          label="Description"
                          value={
                            result.description
                          }
                        />

                        <ResultField
                          label="Size or specification"
                          value={
                            result.size_specification
                          }
                        />

                        <ResultField
                          label="Package quantity"
                          value={
                            result.package_quantity
                          }
                        />

                        <View
                          style={
                            styles.confidenceSection
                          }
                        >
                          <View
                            style={
                              styles.confidenceHeader
                            }
                          >
                            <Text
                              style={
                                styles.resultFieldLabel
                              }
                            >
                              AI confidence
                            </Text>

                            <Text
                              style={
                                styles.confidenceValue
                              }
                            >
                              {confidence}%
                            </Text>
                          </View>

                          <View
                            style={
                              styles.confidenceTrack
                            }
                          >
                            <View
                              style={[
                                styles.confidenceFill,
                                {
                                  width: `${confidence}%`,
                                },
                              ]}
                            />
                          </View>
                        </View>

                        <View
                          style={
                            styles.resultActionsRow
                          }
                        >
                          <Pressable
                            onPress={() =>
                              viewSourcePhoto(
                                result
                              )
                            }
                            style={({
                              pressed,
                            }) => [
                              styles.photoButton,
                              pressed &&
                                styles.buttonPressed,
                            ]}
                          >
                            <Text
                              style={
                                styles.photoButtonText
                              }
                            >
                              Photo
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() =>
                              beginEditing(index)
                            }
                            style={({
                              pressed,
                            }) => [
                              styles.editButton,
                              pressed &&
                                styles.buttonPressed,
                            ]}
                          >
                            <Text
                              style={
                                styles.editButtonText
                              }
                            >
                              Edit Item
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() =>
                              toggleConfirmed(
                                index
                              )
                            }
                            style={({
                              pressed,
                            }) => [
                              styles.confirmButton,
                              result.is_confirmed &&
                                styles.unconfirmButton,
                              pressed &&
                                styles.buttonPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.confirmButtonText,
                                result.is_confirmed &&
                                  styles.unconfirmButtonText,
                              ]}
                            >
                              {result.is_confirmed
                                ? "Mark Unreviewed"
                                : "Confirm Correct"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  }
                )}
              </View>
            )}
        </ScrollView>

        <View
          onLayout={(event) => {
            setFooterHeight(
              Math.ceil(event.nativeEvent.layout.height)
            );
          }}
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(
                safeAreaInsets.bottom,
                10
              ),
            },
          ]}
        >
          {!hasResults ? (
            <>
            {nativeUploadSupported && !isProcessing && <Pressable accessibilityRole="button" disabled={alertBusy} onPress={() => void toggleCompletionAlert()} style={{ padding: 14 }}>
              <Text style={{ color: "#93C5FD", textAlign: "center" }}>{alertBusy ? "Updating notification…" : completionAlertToken ? "Completion notification on · Turn off" : "Notify me when analysis finishes"}</Text>
            </Pressable>}
            <Pressable
              disabled={
                isProcessing ||
                isFinalizing ||
                photoCount === 0
              }
              onPress={analyzePhotos}
              style={({ pressed }) => [
                styles.primaryButton,
                (isProcessing ||
                  isFinalizing ||
                  photoCount === 0) &&
                  styles.primaryButtonDisabled,
                pressed &&
                  !isProcessing &&
                  !isFinalizing &&
                  photoCount > 0 &&
                  styles.buttonPressed,
              ]}
            >
              {isProcessing ? (
                <View
                  style={styles.processingRow}
                >
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    {jobProgress > 0
                      ? `Analyzing ${jobProgress}%`
                      : "Uploading Photos..."}
                  </Text>
                </View>
              ) : (
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  {photoCount === 0
                    ? "Return and Add Photos"
                    : `Analyze ${photoCount} ${
                        photoCount === 1
                          ? "Photo"
                          : "Photos"
                      }`}
                </Text>
              )}
            </Pressable>
            </>
          ) : (
            <>
              {!correctedWorkbookUrl && !allResultsConfirmed && (
                <View style={styles.compactReviewStatus}>
                  <View style={styles.compactReviewHeader}>
                    <Text style={styles.compactReviewTitle}>
                      {allResultsConfirmed
                        ? "Review complete"
                        : `Item ${firstUnconfirmedIndex + 1} of ${results.length}`}
                    </Text>

                    <Text style={styles.compactReviewCount}>
                      {confirmedCount}/{results.length} confirmed
                    </Text>
                  </View>

                  <View style={styles.compactProgressTrack}>
                    <View
                      style={[
                        styles.compactProgressFill,
                        { width: `${progressPercent}%` },
                      ]}
                    />
                  </View>
                </View>
              )}

              {allResultsConfirmed ? (
                correctedWorkbookUrl ? null : (
                  <View style={styles.finalizeCard}>
                  <View style={styles.finalizeHeaderRow}>
                    <View style={styles.finalizeTitleArea}>
                      <Text style={styles.finalizeTitle}>
                        Review complete
                      </Text>
                    </View>

                  </View>

                  <Pressable
                    disabled={isFinalizing}
                    onPress={() => {
                      void viewReportImmediately();
                    }}
                    style={({ pressed }) => [
                      styles.viewReportButton,
                      isFinalizing &&
                        styles.primaryButtonDisabled,
                      pressed &&
                        !isFinalizing &&
                        styles.buttonPressed,
                    ]}
                  >
                    {isFinalizing ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : (
                      <Text
                        style={
                          styles.viewReportButtonText
                        }
                      >
                        View Report
                      </Text>
                    )}
                  </Pressable>


                  <View style={styles.compactEmailRow}>
                    <View style={styles.compactEmailInput}>
                      <Text style={styles.reportRecipientLabel}>
                        REPORT WILL BE EMAILED TO
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={styles.reportRecipientEmail}
                      >
                        {recipientEmail || "Account email unavailable"}
                      </Text>
                    </View>

                    <Pressable
                      disabled={isFinalizing}
                      onPress={() =>
                        finalizeWalkthrough(true)
                      }
                      style={({ pressed }) => [
                        styles.compactFinalizeButton,
                        isFinalizing && styles.primaryButtonDisabled,
                        pressed && !isFinalizing && styles.buttonPressed,
                      ]}
                    >
                      {isFinalizing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.compactFinalizeButtonText}>
                          Email Report
                        </Text>
                      )}
                    </Pressable>
                  </View>
                  </View>
                )
              ) : (
                <View style={styles.unconfirmedFooterActions}>
                  <Pressable
                    disabled={isFinalizing}
                    onPress={confirmNextItem}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      isFinalizing && styles.primaryButtonDisabled,
                      pressed && !isFinalizing && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {`Confirm Item ${
                        firstUnconfirmedIndex + 1
                      } of ${results.length}`}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Finish walkthrough with ${remainingCount} review ${
                      remainingCount === 1 ? "item" : "items"
                    }`}
                    disabled={isFinalizing || isDiscarding}
                    onPress={finishWithReviewItems}
                    style={({ pressed }) => [
                      styles.finishWithReviewButton,
                      (isFinalizing || isDiscarding) &&
                        styles.disabledButton,
                      pressed &&
                        !isFinalizing &&
                        !isDiscarding &&
                        styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.finishWithReviewButtonText}>
                      {`Finish with ${remainingCount} Review ${
                        remainingCount === 1 ? "Item" : "Items"
                      }`}
                    </Text>
                  </Pressable>
                </View>
              )}

              {!correctedWorkbookUrl && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel walkthrough and do not publish results"
                  disabled={isFinalizing || isDiscarding}
                  onPress={confirmDiscardWalkthrough}
                  style={({ pressed }) => [
                    styles.discardButton,
                    (isFinalizing || isDiscarding) &&
                      styles.disabledButton,
                    pressed &&
                      !isFinalizing &&
                      !isDiscarding &&
                      styles.buttonPressed,
                  ]}
                >
                  {isDiscarding ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFB6B6"
                    />
                  ) : (
                    <Text style={styles.discardButtonText}>
                      Cancel walkthrough
                    </Text>
                  )}
                </Pressable>
              )}

              {correctedWorkbookUrl && (
                <View style={styles.completionActionsCard}>
                  <View style={styles.completionActionsHeader}>
                    <View style={styles.completionCheck}>
                      <Text style={styles.completionCheckText}>✓</Text>
                    </View>

                    <View style={styles.completionActionsTitleArea}>
                      <Text style={styles.completionActionsTitle}>
                        Walkthrough Complete
                      </Text>

                      <Text style={styles.completionActionsSubtitle}>
                        Your finalized report is ready.
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={openCorrectedWorkbook}
                    style={({ pressed }) => [
                      styles.completionViewButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.completionViewButtonText}>
                      View Report
                    </Text>
                  </Pressable>

                  <View style={styles.completionEmailRow}>
                    <View style={styles.completionEmailInput}>
                      <Text style={styles.reportRecipientLabel}>
                        REPORT WILL BE EMAILED TO
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={styles.reportRecipientEmail}
                      >
                        {recipientEmail || "Account email unavailable"}
                      </Text>
                    </View>

                    <Pressable
                      disabled={isFinalizing}
                      onPress={() => finalizeWalkthrough(true)}
                      style={({ pressed }) => [
                        styles.completionEmailButton,
                        isFinalizing && styles.primaryButtonDisabled,
                        pressed &&
                          !isFinalizing &&
                          styles.buttonPressed,
                      ]}
                    >
                      {isFinalizing ? (
                        <ActivityIndicator
                          size="small"
                          color="#FFFFFF"
                        />
                      ) : (
                        <Text style={styles.completionEmailButtonText}>
                          Email Report
                        </Text>
                      )}
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={startOver}
                    style={({ pressed }) => [
                      styles.completionDoneButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.completionDoneButtonText}>
                      Done
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          {!hasResults && (
            <Text style={styles.footerNote}>
              AI results must be reviewed before finalization.
            </Text>
          )}
        </View>

        <Modal
          visible={sourcePhotoViewer !== null}
          animationType="fade"
          presentationStyle="pageSheet"
          allowSwipeDismissal
          onDismiss={() =>
            setSourcePhotoViewer(null)
          }
          onRequestClose={() =>
            setSourcePhotoViewer(null)
          }
        >
          <View style={styles.photoViewerSafeArea}>
            <View
              style={[
                styles.photoViewerHeader,
                {
                  minHeight:
                    68 + safeAreaInsets.top,
                  paddingTop:
                    safeAreaInsets.top,
                },
              ]}
            >
              <Pressable
                onPress={() =>
                  setSourcePhotoViewer(null)
                }
                hitSlop={12}
                style={({ pressed }) => [
                  styles.photoViewerCloseButton,
                  pressed &&
                    styles.buttonPressed,
                ]}
              >
                <Text
                  style={
                    styles.photoViewerCloseText
                  }
                >
                  Close
                </Text>
              </Pressable>

              <View style={styles.photoViewerTitleArea}>
                <Text
                  numberOfLines={1}
                  style={styles.photoViewerTitle}
                >
                  {sourcePhotoViewer?.label ||
                    "Source Photo"}
                </Text>
                <Text style={styles.photoViewerHint}>
                  Pinch to zoom
                </Text>
              </View>

              <View
                style={
                  styles.photoViewerHeaderSpacer
                }
              />
            </View>

            {sourcePhotoViewer && (
              <ScrollView
                ref={photoViewerScrollRef}
                style={styles.photoViewerScroll}
                contentContainerStyle={
                  styles.photoViewerContent
                }
                centerContent
                minimumZoomScale={1}
                maximumZoomScale={5}
                scrollEventThrottle={16}
                onScroll={(event) => {
                  const zoomScale =
                    event.nativeEvent.zoomScale;

                  if (
                    typeof zoomScale === "number"
                  ) {
                    photoViewerIsZoomed.current =
                      zoomScale > 1.1;
                  }
                }}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
              >
                <Pressable
                  onPress={handlePhotoViewerTap}
                  style={{
                    width: windowWidth,
                    height:
                      photoViewerImageHeight,
                  }}
                >
                  <Image
                    source={{
                      uri: sourcePhotoViewer.uri,
                    }}
                    resizeMode="contain"
                    style={styles.photoViewerImage}
                  />
                </Pressable>
              </ScrollView>
            )}
          </View>
        </Modal>

        <Modal
          visible={
            editingIndex !== null &&
            editDraft !== null
          }
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={cancelEditing}
        >
          <SafeAreaView
            style={styles.modalSafeArea}
          >
            <KeyboardAvoidingView
              style={styles.modalScreen}
              behavior={
                Platform.OS === "ios"
                  ? "padding"
                  : undefined
              }
            >
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={cancelEditing}
                  style={({ pressed }) => [
                    styles.modalCancelButton,
                    pressed &&
                      styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={
                      styles.modalCancelButtonText
                    }
                  >
                    Cancel
                  </Text>
                </Pressable>

                <Text style={styles.modalTitle}>
                  Edit Inventory Item
                </Text>

                <View
                  style={
                    styles.modalHeaderSpacer
                  }
                />
              </View>

              {editDraft && (
                <ScrollView
                  style={
                    styles.modalScrollView
                  }
                  contentContainerStyle={
                    styles.modalScrollContent
                  }
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={
                    false
                  }
                >
                  {(() => {
                    const index = getSourcePhotoIndex(editDraft.photo, photos.length);
                    const photo = index !== null && index >= 0 ? photos[index] : undefined;
                    return photo ? (LABEL_RETAKES_ENABLED ? <LabelSourcePhoto key={photo.uri} uri={photo.uri} box={editDraft.source_identifier_bbox || editDraft.source_bbox} /> : <View><Text style={{ color: "#a9c9ef", marginBottom: 8 }}>Source photo · pinch to zoom</Text><ScrollView style={{ height: 270 }} minimumZoomScale={1} maximumZoomScale={5} centerContent><Image source={{ uri: photo.uri }} style={{ width: "100%", height: 270 }} resizeMode="contain" /></ScrollView></View>) : <Text style={{ color: "#f5d078" }}>Source photo unavailable. Verify against the original label.</Text>;
                  })()}
                  <View
                    style={
                      styles.modalIntroCard
                    }
                  >
                    <Text
                      style={
                        styles.modalIntroTitle
                      }
                    >
                      Item{" "}
                      {editingIndex !== null
                        ? editingIndex + 1
                        : ""}
                    </Text>

                    <Text
                      style={
                        styles.modalIntroText
                      }
                    >
                      Correct anything that was
                      read incorrectly. Saving
                      marks this item as confirmed.
                    </Text>
                  </View>

                  <EditableField
                    label="Location"
                    value={editDraft.location}
                    onChangeText={(value) =>
                      updateDraft(
                        "location",
                        value
                      )
                    }
                    placeholder="Example: Maintenance Area"
                  />

                  <EditableField
                    label="Vendor"
                    value={editDraft.vendor}
                    onChangeText={(value) =>
                      updateDraft(
                        "vendor",
                        value
                      )
                    }
                    placeholder="Example: Komar"
                  />

                  <EditableField
                    label="Manufacturer"
                    value={
                      editDraft.manufacturer
                    }
                    onChangeText={(value) =>
                      updateDraft(
                        "manufacturer",
                        value
                      )
                    }
                  />

                  <Text style={{ color: "#FBBF24", marginBottom: 12 }}>{getReviewReasons(editDraft).join(" · ") || "Verify each value against the source photo."}</Text>
                  {(() => { const index = getSourcePhotoIndex(editDraft.photo, photos.length); const uri = index === null ? "" : (recoveryRef.current?.photos || photos)[index]?.uri;
                    return uri ? <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", height: 220, marginBottom: 12 }} /> : null; })()}
                  {LABEL_RETAKES_ENABLED && !correctedWorkbookUrl && <LabelRetakePanel key={editingIndex}
                    original={editDraft} attempt={editDraft.retake_attempt} customer={completedCustomer || selectedCustomerName}
                    customerId={customerId} location={editDraft.location}
                    blocked={reviewTask === "sourcing"}
                    onBusy={value => { retakeBusy.current = value; setReviewTask(value ? "retake" : null); }}
                    onAttempt={value => persistReviewPatch({ retake_attempt: value })}
                    onApply={(candidate, index) => setEditDraft(current => {
                      if (!current?.retake_attempt?.jobId) return current;
                      const reference = { job_id: current.retake_attempt.jobId, candidate_index: index };
                      const references = (current.retake_references || []).filter(ref => ref.job_id !== reference.job_id);
                      return { ...fillRetakeBlanks(current, candidate), retake_references: [...references, reference] };
                    })} />}
                  {SOURCING_ENABLED && !correctedWorkbookUrl && <SourcingPanel initialManufacturer={editDraft.manufacturer} initialManufacturerPartNumber={editDraft.manufacturer_part_number} key={`sourcing-${editingIndex}`}
                    saved={editDraft.sourcing_state} jobId={currentJobId} photo={editDraft.photo}
                    existingFastenal={editDraft.fastenal_part_number} blocked={reviewTask === "retake"}
                    onBusy={value => setReviewTask(value ? "sourcing" : null)}
                    onState={value => persistReviewPatch({ sourcing_state: value, sourcing_lookup_id: value.proposalId, sourcing_lookup_token: value.targetToken })}
                    onClear={() => persistReviewPatch({ fastenal_part_number: editDraftLatest.current?.sourcing_selection_id ? (editDraftLatest.current?.sourcing_previous_fastenal || "") : (editDraftLatest.current?.fastenal_part_number || ""), sourcing_lookup_id: undefined, sourcing_lookup_token: undefined, sourcing_selection_id: undefined, sourcing_target_token: undefined, sourcing_previous_fastenal: undefined, sourcing_state: undefined, is_confirmed: false, review_needed: true })}
                    onSelected={async (state, proposal) => {
                      const current = editDraftLatest.current;
                      if (current) await persistReviewPatch(applySourcingSelection(current, state, proposal));
                    }} />}
                  <Text style={{ color: "#CBD5E1", marginBottom: 12 }}>Source text: {editDraft.label_text || "No readable label text"}</Text>
                  <EditableField label="Observed part number (unclassified)" value={editDraft.part_number} onChangeText={value => updateDraft("part_number", value)} />
                  <EditableField label="Customer part number" value={editDraft.customer_part_number} onChangeText={value => updateDraft("customer_part_number", value)} />
                  <EditableField label="Fastenal item number" value={editDraft.fastenal_part_number} onChangeText={value => updateDraft("fastenal_part_number", value)} />
                  <EditableField
                    label="Manufacturer part number"
                    value={
                      editDraft.manufacturer_part_number
                    }
                    onChangeText={(value) =>
                      updateDraft(
                        "manufacturer_part_number",
                        value
                      )
                    }
                  />

                  <EditableField
                    label="Vendor part number"
                    value={
                      editDraft.vendor_part_number
                    }
                    onChangeText={(value) =>
                      updateDraft(
                        "vendor_part_number",
                        value
                      )
                    }
                  />

                  <EditableField
                    label="Description"
                    value={
                      editDraft.description
                    }
                    onChangeText={(value) =>
                      updateDraft(
                        "description",
                        value
                      )
                    }
                    multiline
                  />

                  <EditableField
                    label="Size or specification"
                    value={
                      editDraft.size_specification
                    }
                    onChangeText={(value) =>
                      updateDraft(
                        "size_specification",
                        value
                      )
                    }
                  />

                  <EditableField
                    label="Package quantity"
                    value={
                      editDraft.package_quantity
                    }
                    onChangeText={(value) =>
                      updateDraft(
                        "package_quantity",
                        value
                      )
                    }
                  />

                  <EditableField
                    label="Recognition notes"
                    value={editDraft.notes}
                    onChangeText={(value) =>
                      updateDraft(
                        "notes",
                        value
                      )
                    }
                    multiline
                  />

                  <EditableField
                    label="Visible label text"
                    value={
                      editDraft.label_text
                    }
                    onChangeText={(value) =>
                      updateDraft(
                        "label_text",
                        value
                      )
                    }
                    multiline
                  />

                  <Pressable accessibilityRole="button" onPress={() => saveEditedResult(true)} style={styles.saveChangesButton}>
                    <Text style={styles.saveChangesButtonText}>Confirm and next</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => saveEditedResult()}
                    style={({ pressed }) => [
                      styles.saveChangesButton,
                      pressed &&
                        styles.buttonPressed,
                    ]}
                  >
                    <Text
                      style={
                        styles.saveChangesButtonText
                      }
                    >
                      Confirm item
                    </Text>
                  </Pressable>



                  <Pressable
                    onPress={
                      requestRemoveEditedResult
                    }
                    style={({ pressed }) => [
                      styles.removeResultButton,
                      pressed &&
                        styles.buttonPressed,
                    ]}
                  >
                    <Text
                      style={
                        styles.removeResultButtonText
                      }
                    >
                      Remove False Result
                    </Text>
                  </Pressable>
                </ScrollView>
              )}
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#091321",
  },

  keyboardAvoidingView: {
    flex: 1,
  },

  screen: {
    flex: 1,
    backgroundColor: "#091321",
  },

  header: {
    minHeight: 100,
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  backButton: {
    width: 132,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#2D74F4",
  },

  backArrow: {
    color: "#FFFFFF",
    fontSize: 33,
    marginRight: 8,
  },

  backText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 32,
  },

  uploadCard: {
    minHeight: 330,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#34577E",
    backgroundColor: "#0D1B2E",
    padding: 28,
  },

  uploadIconContainer: {
    width: 120,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },

  uploadIcon: {
    fontSize: 72,
  },

  uploadArrow: {
    position: "absolute",
    color: "#65B8FF",
    fontSize: 54,
    top: 31,
  },

  title: {flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 18,
  },

  description: {
    color: "#99A9BE",
    fontSize: 17,
    lineHeight: 26,
    textAlign: "center",
    marginTop: 15,
  },

  nameSection: {
    marginTop: 24,
  },

  nameLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },

  nameInput: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#354C69",
    backgroundColor: "#112036",
    color: "#FFFFFF",
    fontSize: 17,
    paddingHorizontal: 17,
  },

  nameInputDisabled: {
    opacity: 0.82,
  },

  selectedCustomerDetail: {
    color: "#8FA2BA",
    fontSize: 14,
    marginTop: 9,
  },

  previewSection: {
    marginTop: 27,
  },

  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  previewHeaderText: {
    flex: 1,
  },

  previewTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
  },

  previewSubtitle: {
    color: "#879AB3",
    fontSize: 14,
    marginTop: 4,
  },

  countBadge: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2868EA",
  },

  countBadgeText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },

  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  photoCard: {
    width: "48%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#385675",
    marginRight: "2%",
    marginBottom: 12,
  },

  photoImage: {
    width: "100%",
    height: "100%",
  },

  photoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "rgba(5,15,26,0.84)",
  },

  photoNumber: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  processingCard: {
    minHeight: 340,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#34577E",
    backgroundColor: "#0D1B2E",
    padding: 30,
  },

  processingTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 24,
  },

  processingMessageHeading: {
    color: "#62B4FF",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 16,
  },

  processingText: {
    color: "#9EADC0",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    marginTop: 6,
    minHeight: 48,
  },

  processingNote: {
    color: "#62B4FF",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 20,
  },

  processingProgressTrack: {
    width: "100%",
    height: 14,
    overflow: "hidden",
    borderRadius: 7,
    backgroundColor: "#233A55",
    marginTop: 16,
  },

  processingProgressFill: {
    height: "100%",
    borderRadius: 7,
    backgroundColor: "#3B9DFF",
  },

  processingProgressLabels: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 7,
  },

  processingProgressLabel: {
    color: "#7188A4",
    fontSize: 12,
    fontWeight: "700",
  },

  processingKeepOpenText: {
    color: "#7F94AD",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 15,
  },

  errorCard: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#7D3B4D",
    backgroundColor: "#311A24",
    padding: 18,
  },

  errorIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    color: "#FFFFFF",
    backgroundColor: "#D74D71",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 34,
    marginRight: 13,
  },

  errorTextContainer: {
    flex: 1,
  },

  errorTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  errorText: {
    color: "#FFB5C5",
    lineHeight: 21,
    marginTop: 5,
  },

  resultsSection: {
    paddingBottom: 5,
  },

  readySummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2A6B57",
    backgroundColor: "#102A24",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  readySummaryCheck: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#39D495",
    marginRight: 12,
  },

  readySummaryCheckText: {
    color: "#082018",
    fontSize: 20,
    fontWeight: "900",
  },

  readySummaryTextArea: {
    flex: 1,
  },

  readySummaryTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },

  readySummarySubtitle: {
    color: "#9FC6B9",
    fontSize: 13,
    marginTop: 3,
  },

  completedCard: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#286A58",
    backgroundColor: "#102B29",
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 14,
  },

  completedIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3BD08B",
  },

  completedIconText: {
    color: "#06251B",
    fontSize: 29,
    fontWeight: "900",
  },

  completedTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 12,
  },

  completedText: {
    color: "#A6C3BC",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    marginTop: 9,
  },

  aiDisclaimerCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#35506E",
    backgroundColor: "#102033",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },

  aiDisclaimerIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    color: "#D8E8FA",
    backgroundColor: "#284968",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 22,
    marginRight: 10,
  },

  aiDisclaimerText: {
    flex: 1,
    color: "#AFC2D8",
    fontSize: 13,
    lineHeight: 18,
  },

  emailSuccessCard: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#27705A",
    backgroundColor: "#11362D",
    padding: 18,
    marginBottom: 18,
  },

  emailSuccessIcon: {
    color: "#62E0AC",
    fontSize: 30,
    marginRight: 14,
  },

  emailSuccessText: {
    flex: 1,
  },

  emailSuccessTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },

  emailSuccessDescription: {
    color: "#A5D9C7",
    lineHeight: 21,
    marginTop: 5,
  },

  reviewProgressCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2E4868",
    backgroundColor: "#101E31",
    padding: 18,
    marginBottom: 22,
  },

  reviewProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  reviewProgressTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  reviewProgressText: {
    color: "#8FA2BA",
    marginTop: 4,
  },

  progressBadge: {
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#3C2C1F",
  },

  progressBadgeComplete: {
    backgroundColor: "#183E33",
  },

  progressBadgeText: {
    color: "#FFC17C",
    fontWeight: "900",
  },

  progressBadgeTextComplete: {
    color: "#64DFA8",
  },

  progressTrack: {
    height: 10,
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: "#263950",
    marginTop: 16,
  },

  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#3BD08B",
  },

  reviewQuickActions: {
    marginTop: 15,
  },

  jumpButton: {
    minHeight: 45,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#3B5E86",
    backgroundColor: "#162B45",
  },

  jumpButtonText: {
    color: "#8EC8FF",
    fontWeight: "800",
  },

  confirmAllButton: {
    minHeight: 45,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1D4F44",
    marginTop: 10,
  },

  confirmAllButtonText: {
    color: "#72E1B2",
    fontWeight: "800",
  },

  resultsSubtitle: {
    color: "#8295AE",
    fontSize: 13,
    marginTop: 3,
  },

  reviewModeToggle: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    backgroundColor: "#17263A",
    borderWidth: 1,
    borderColor: "#2B405B",
  },

  reviewModeOption: {
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  reviewModeOptionActive: {
    backgroundColor: "#2E6DEA",
  },

  reviewModeText: {
    color: "#91A2B8",
    fontSize: 12,
    fontWeight: "800",
  },

  reviewModeTextActive: {
    color: "#FFFFFF",
  },

  areaReviewSection: {
    marginBottom: 18,
  },

  areaReviewHeader: {
    minHeight: 68,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#315378",
    backgroundColor: "#14263C",
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  areaReviewTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  areaIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E4772",
    marginRight: 11,
  },

  areaIconText: {
    color: "#8BC6FF",
    fontSize: 20,
    fontWeight: "800",
  },

  areaReviewTitleContainer: {
    flex: 1,
  },

  areaReviewTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  areaReviewMeta: {
    color: "#8EA1B9",
    fontSize: 12,
    marginTop: 3,
  },

  areaChevron: {
    color: "#8EC8FF",
    fontSize: 24,
    fontWeight: "500",
    marginLeft: 12,
  },

  areaReviewItems: {
    paddingLeft: 4,
  },

  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  resultsTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
  },

  resultCountBadge: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2E6DEA",
  },

  resultCountText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  resultCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2E4562",
    backgroundColor: "#111E31",
    padding: 19,
    marginBottom: 16,
  },

  resultCardNeedsReview: {
    borderColor: "#A66D2F",
    backgroundColor: "#171F2D",
  },

  resultCardConfirmed: {
    borderColor: "#266C58",
  },

  resultCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#283D58",
  },

  resultNumber: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2D6DEB",
    marginRight: 12,
  },

  resultNumberText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  resultHeaderTextContainer: {
    flex: 1,
    marginRight: 10,
  },

  resultCardTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  resultPhotoName: {
    color: "#8295AE",
    fontSize: 12,
    marginTop: 4,
  },

  badgeColumn: {
    alignItems: "flex-end",
  },

  editedBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#183D62",
    marginBottom: 5,
  },

  editedBadgeText: {
    color: "#72BAFF",
    fontSize: 12,
    fontWeight: "900",
  },

  reviewBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  reviewBadgeNeeded: {
    backgroundColor: "#4B2C1E",
  },

  reviewBadgeReady: {
    backgroundColor: "#183E33",
  },

  reviewBadgeText: {
    fontSize: 12,
    fontWeight: "900",
  },

  reviewBadgeTextNeeded: {
    color: "#FFB374",
  },

  reviewBadgeTextReady: {
    color: "#66E0AA",
  },

  reviewReasonCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#76502D",
    backgroundColor: "#2B2118",
    padding: 14,
    marginTop: 16,
    marginBottom: 4,
  },

  reviewReasonTitle: {
    color: "#FFD09B",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 8,
  },

  reviewReasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 4,
  },

  reviewReasonBullet: {
    color: "#FFB374",
    fontSize: 18,
    lineHeight: 20,
    marginRight: 8,
  },

  reviewReasonText: {
    flex: 1,
    color: "#F4C79C",
    fontSize: 14,
    lineHeight: 20,
  },

  resultField: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#263A53",
  },

  resultFieldLabel: {
    color: "#7F94AF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  resultFieldValue: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
    marginTop: 5,
  },

  missingValue: {
    color: "#657991",
    fontStyle: "italic",
  },

  confidenceSection: {
    paddingVertical: 15,
  },

  confidenceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  confidenceValue: {
    color: "#66B7FF",
    fontWeight: "800",
  },

  confidenceTrack: {
    height: 9,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "#263A52",
    marginTop: 10,
  },

  confidenceFill: {
    height: "100%",
    backgroundColor: "#3484F5",
  },

  resultActionsRow: {
    flexDirection: "row",
    marginTop: 16,
  },

  photoButton: {
    flex: 0.8,
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#3B5F82",
    backgroundColor: "#15283E",
    marginRight: 8,
  },

  photoButtonText: {
    color: "#A9D3FF",
    fontSize: 12,
    fontWeight: "900",
  },

  editButton: {
    flex: 0.8,
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2C67E5",
    marginRight: 8,
  },

  editButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  confirmButton: {
    flex: 1.4,
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2E7A63",
    backgroundColor: "#17382F",
  },

  confirmButtonText: {
    color: "#70DEAD",
    fontSize: 12,
    fontWeight: "800",
  },

  unconfirmButton: {minHeight: 44,
    borderColor: "#6B4B32",
    backgroundColor: "#32261D",
  },

  unconfirmButtonText: {
    color: "#E8B781",
  },

  compactReviewStatus: {
    marginBottom: 9,
  },

  compactReviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  compactReviewTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  compactReviewCount: {
    color: "#94A8C0",
    fontSize: 12,
    fontWeight: "700",
  },

  compactProgressTrack: {
    height: 4,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: "#263950",
    marginTop: 6,
  },

  compactProgressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#3BD08B",
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#26384E",
    backgroundColor: "#091321",
  },

  finalizeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#29445F",
    backgroundColor: "#122033",
    padding: 12,
  },

  finalizeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  finalizeTitleArea: {
    flex: 1,
    paddingRight: 10,
  },

  finalizeTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  finalizeSubtitle: {
    color: "#8296AE",
    fontSize: 12,
    marginTop: 2,
  },

  readyBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#28785A",
    backgroundColor: "#15392D",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },

  readyBadgeText: {
    color: "#7DE2B3",
    fontSize: 12,
    fontWeight: "900",
  },

  viewReportButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#176347",
    marginBottom: 14,
  },

  viewReportButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  reportChoiceDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
  },

  reportChoiceLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#29445F",
  },

  reportChoiceText: {
    color: "#8296AE",
    fontSize: 12,
    fontWeight: "900",
    marginHorizontal: 9,
  },

  compactEmailRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  compactEmailInput: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#36506E",
    backgroundColor: "#112036",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 9,
  },

  reportRecipientLabel: {
    color: "#6F86A2",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  reportRecipientEmail: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },

  compactFinalizeButton: {
    minWidth: 112,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#2D6DEB",
    paddingHorizontal: 16,
  },

  compactFinalizeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  completionActionsCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#285D4B",
    backgroundColor: "#102A24",
    padding: 16,
  },

  completionActionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  completionCheck: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B6B4E",
    marginRight: 12,
  },

  completionCheckText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },

  completionActionsTitleArea: {
    flex: 1,
  },

  completionActionsTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },

  completionActionsSubtitle: {
    color: "#9CCBB9",
    fontSize: 12,
    marginTop: 3,
  },

  completionViewButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#176347",
  },

  completionViewButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  completionEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  completionEmailInput: {
    flex: 1,
    minHeight: 46,
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#365B52",
    backgroundColor: "#0E201D",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 9,
  },

  completionEmailButton: {
    minWidth: 112,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#2D6DEB",
    paddingHorizontal: 14,
  },

  completionEmailButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  completionDoneButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#466D63",
    backgroundColor: "#17342D",
    marginTop: 10,
  },

  completionDoneButtonText: {
    color: "#DDF9EE",
    fontSize: 15,
    fontWeight: "900",
  },

  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#2D6DEB",
  },

  primaryButtonDisabled: {
    backgroundColor: "#1B2D44",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  discardButton: {
    alignSelf: "center",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    paddingHorizontal: 18,
  },

  discardButtonText: {
    color: "#EF98A3",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    textDecorationLine: "underline",
  },

  correctedButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "#176347",
    marginTop: 11,
  },

  correctedButtonText: {
    color: "#8EF0C5",
    fontSize: 14,
    fontWeight: "800",
  },

  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#38516F",
    backgroundColor: "#132238",
    marginTop: 11,
  },

  secondaryButtonText: {
    color: "#B9C8DA",
    fontSize: 14,
    fontWeight: "800",
  },

  processingRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  unconfirmedFooterActions: {
    gap: 10,
  },
  finishWithReviewButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#31547D",
    backgroundColor: "#17283D",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  finishWithReviewButtonText: {
    color: "#93C5FD",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  footerNote: {
    color: "#71849D",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 12,
  },

  disabledButton: {
    opacity: 0.55,
  },

  buttonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },

  photoViewerSafeArea: {
    flex: 1,
    backgroundColor: "#02070D",
  },

  photoViewerHeader: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#26384E",
    paddingHorizontal: 14,
  },

  photoViewerCloseButton: {
    width: 70,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#17283C",
  },

  photoViewerCloseText: {
    color: "#BFD5EA",
    fontSize: 13,
    fontWeight: "900",
  },

  photoViewerTitleArea: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },

  photoViewerTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  photoViewerHint: {
    color: "#71849D",
    fontSize: 12,
    marginTop: 2,
  },

  photoViewerHeaderSpacer: {
    width: 70,
  },

  photoViewerScroll: {
    flex: 1,
  },

  photoViewerContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  photoViewerImage: {
    width: "100%",
    height: "100%",
  },

  modalSafeArea: {
    flex: 1,
    backgroundColor: "#091321",
  },

  modalScreen: {
    flex: 1,
  },

  modalHeader: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#223650",
  },

  modalCancelButton: {
    minWidth: 70,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#182A40",
  },

  modalCancelButtonText: {
    color: "#AFC1D5",
    fontWeight: "800",
  },

  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  modalHeaderSpacer: {
    width: 70,
  },

  modalScrollView: {
    flex: 1,
  },

  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 44,
  },

  modalIntroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2F4969",
    backgroundColor: "#102039",
    padding: 18,
    marginBottom: 20,
  },

  modalIntroTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
  },

  modalIntroText: {
    color: "#9FB0C4",
    lineHeight: 21,
    marginTop: 7,
  },

  editField: {
    marginBottom: 17,
  },

  editFieldLabel: {
    color: "#A8B8CA",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
  },

  editInput: {
    minHeight: 55,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#344E6D",
    backgroundColor: "#111F33",
    color: "#FFFFFF",
    fontSize: 16,
    paddingHorizontal: 15,
  },

  editInputMultiline: {
    minHeight: 110,
    paddingTop: 14,
    paddingBottom: 14,
  },

  saveChangesButton: {
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "#2D6DEB",
    marginTop: 6,
  },

  saveChangesButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  removeResultButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#8A4141",
    backgroundColor: "#2B171A",
    marginTop: 12,
  },

  removeResultButtonText: {
    color: "#FF9A9A",
    fontSize: 15,
    fontWeight: "900",
  },
});
