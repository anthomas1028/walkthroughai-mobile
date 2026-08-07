import * as ImageManipulator from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { API_BASE_URL, apiFetch } from "../lib/api";


const UPLOAD_API_URL = `${API_BASE_URL}/api/upload`;

const FINALIZE_API_URL = `${API_BASE_URL}/api/finalize`;

const JOB_POLL_INTERVAL_MS = 2500;

const ANALYSIS_WAITING_MESSAGES = [
  {
    heading: "While you wait…",
    text: "Why did the inventory label get promoted? It always had the right part number.",
  },
  {
    heading: "Did you know?",
    text: "Octopuses have three hearts.",
  },
  {
    heading: "While you wait…",
    text: "I only know 25 letters of the alphabet. I do not know y.",
  },
  {
    heading: "Did you know?",
    text: "A day on Venus is longer than a year on Venus.",
  },
  {
    heading: "While you wait…",
    text: "Why was the bolt so confident? It knew it was a perfect fit.",
  },
  {
    heading: "Did you know?",
    text: "Bananas are berries, but strawberries are not.",
  },
  {
    heading: "While you wait…",
    text: "What do you call a factory that makes okay products? A satisfactory.",
  },
  {
    heading: "Did you know?",
    text: "Honey can remain edible for thousands of years when properly sealed.",
  },
  {
    heading: "While you wait…",
    text: "Why did the shelf apply for a job? It had plenty of experience supporting things.",
  },
  {
    heading: "Did you know?",
    text: "Sharks existed before trees.",
  },
  {
    heading: "While you wait…",
    text: "I ordered a chicken and an egg online. I will let you know.",
  },
  {
    heading: "Did you know?",
    text: "The Eiffel Tower can grow several inches taller during hot weather.",
  },
  {
    heading: "While you wait…",
    text: "Why did the screw stay calm? It knew how to keep things together.",
  },
  {
    heading: "Did you know?",
    text: "Wombat droppings are cube-shaped.",
  },
  {
    heading: "While you wait…",
    text: "What did one wall say to the other? I will meet you at the corner.",
  },
  {
    heading: "Did you know?",
    text: "A group of flamingos is called a flamboyance.",
  },
  {
    heading: "While you wait…",
    text: "Why could the bicycle not stand up by itself? It was two-tired.",
  },
  {
    heading: "Did you know?",
    text: "The shortest war in recorded history lasted less than an hour.",
  },
  {
    heading: "While you wait…",
    text: "I used to hate facial hair, but then it grew on me.",
  },
  {
    heading: "Did you know?",
    text: "Sea otters hold hands while sleeping so they do not drift apart.",
  },
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
    reasons.push(`AI confidence is ${confidence}%`);
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
    cleanText(result.part_number).length > 0;

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
  const { width: windowWidth, height: windowHeight } =
    useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const photoViewerImageHeight = Math.max(
    windowHeight - 120,
    320
  );

  const params = useLocalSearchParams<{
    photos?: string | string[];
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

  const selectedCustomerEmail = getSingleParameter(
    params.customerEmail
  );

  const selectedContactName = getSingleParameter(
    params.contactName
  );

  const photos = useMemo(
    () => parsePhotos(params.photos),
    [params.photos]
  );

  const [walkthroughName, setWalkthroughName] =
    useState(
      selectedCustomerName || "Mobile Walkthrough"
    );

  const [recipientEmail, setRecipientEmail] =
    useState(selectedCustomerEmail);

  const [isProcessing, setIsProcessing] =
    useState(false);

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

  const [emailSent, setEmailSent] =
    useState(false);

  const [emailedRecipient, setEmailedRecipient] =
    useState("");

  const [sourcePhotoViewer, setSourcePhotoViewer] =
    useState<SourcePhotoViewer | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const photoViewerScrollRef =
    useRef<ScrollView>(null);
  const lastPhotoViewerTapTime = useRef(0);
  const photoViewerIsZoomed = useRef(false);
  const reviewSectionY = useRef(0);
  const resultCardPositions = useRef<Record<number, number>>({});

  const photoCount = photos.length;
  const hasResults = results.length > 0;

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
    const customer =
      walkthroughName.trim() || "Mobile Walkthrough";

    if (photoCount === 0) {
      Alert.alert(
        "No photos received",
        "Return to the previous screen and select at least one inventory photo."
      );
      return;
    }

    let preparedPhotos: SelectedPhoto[] = [];

    function buildUploadFormData(): FormData {
      const formData = new FormData();

      formData.append("customer", customer);

      if (customerId) {
        formData.append("customer_id", customerId);
      }

      preparedPhotos.forEach((photo, index) => {
        const uploadFile = {
          uri: photo.uri,
          name: getFileName(photo, index),
          type: getMimeType(photo),
        };

        formData.append(
          "photos",
          uploadFile as unknown as Blob
        );
      });

      formData.append(
        "photo_locations",
        JSON.stringify(
          preparedPhotos.map((photo) => cleanText(photo.location))
        )
      );

      return formData;
    }

    async function submitBackgroundJob(): Promise<{
      response: Response;
      data: UploadApiResponse;
    }> {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 180000);

      try {
        const response = await apiFetch(UPLOAD_API_URL, {
          method: "POST",
          body: buildUploadFormData(),
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        const data =
          await readJsonResponse<UploadApiResponse>(
            response
          );

        return { response, data };
      } finally {
        clearTimeout(timeout);
      }
    }

    async function waitForJobCompletion(
      statusUrl: string
    ): Promise<JobStatusApiResponse> {
      const startedAt = Date.now();

      while (true) {
        if (Date.now() - startedAt > JOB_POLL_TIMEOUT_MS) {
          throw new Error(
            "The background analysis is still running after two hours. Your upload may still finish, but this screen stopped checking it."
          );
        }

        const response = await apiFetch(statusUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

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
      setResults([]);
      setOriginalWorkbookUrl(null);
      setCorrectedWorkbookUrl(null);
      setCompletedCustomer("");
      setErrorMessage("");
      setEmailSent(false);
      setEmailedRecipient("");

      preparedPhotos = await preparePhotosForUpload(photos);

      setJobStatusMessage(
        "Uploading photos to Walkthrough AI."
      );

      const { response, data } =
        await submitBackgroundJob();

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

      setJobStatusMessage(
        data.message ||
          "Upload received. Waiting for background analysis."
      );

      const completedJob =
        await waitForJobCompletion(statusUrl);

      const recognizedResults = Array.isArray(
        completedJob.results
      )
        ? completedJob.results
            .map(normalizeResult)
            .map(applySmartConfirmation)
        : [];

      setResults(recognizedResults);
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
      console.warn("Background upload error:", error);

      const isAbortError =
        error instanceof Error &&
        error.name === "AbortError";

      const message = isAbortError
        ? "The photo upload took too long. Please press Analyze again."
        : error instanceof Error
        ? error.message
        : "Walkthrough AI could not analyze the photos.";

      setErrorMessage(message);
      Alert.alert("Analysis failed", message);
    } finally {
      setIsProcessing(false);
    }
  }

  function beginEditing(index: number) {
    setEditingIndex(index);
    setEditDraft({
      ...results[index],
    });
  }

  function cancelEditing() {
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

    const sourcePhoto = photos[sourcePhotoIndex];

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

  function saveEditedResult() {
    if (editingIndex === null || !editDraft) {
      return;
    }

    const finalPartNumber =
      cleanText(
        editDraft.manufacturer_part_number
      ) ||
      cleanText(editDraft.part_number) ||
      cleanText(editDraft.vendor_part_number);

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
  ) {
    const cleanedRecipient =
      recipientEmail.trim();

    if (!allResultsConfirmed) {
      Alert.alert(
        "Review not finished",
        `Confirm the remaining ${remainingCount} ${
          remainingCount === 1 ? "item" : "items"
        } before finalizing.`
      );
      return;
    }

    if (sendEmail && !cleanedRecipient) {
      Alert.alert(
        "Recipient email required",
        "Enter the email address that should receive the finalized workbook."
      );
      return;
    }

    if (
      sendEmail &&
      !isValidEmail(cleanedRecipient)
    ) {
      Alert.alert(
        "Invalid email address",
        "Enter a complete email address, such as name@example.com."
      );
      return;
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

      setResults(
        finalizedResults.map((result) => ({
          ...result,
          is_confirmed: true,
          review_needed: false,
        }))
      );

      setCorrectedWorkbookUrl(
        data.download_url ?? null
      );

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
        "Finalization failed",
        message
      );
    } finally {
      setIsFinalizing(false);
    }
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
          contentContainerStyle={
            styles.scrollContent
          }
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
                Analyzing inventory
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
                {jobProgress}% complete
              </Text>

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
                <View
                  style={styles.completedCard}
                >
                  <View
                    style={styles.completedIcon}
                  >
                    <Text
                      style={
                        styles.completedIconText
                      }
                    >
                      ✓
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.completedTitle
                    }
                  >
                    Recognition Complete
                  </Text>

                  <Text
                    style={
                      styles.completedText
                    }
                  >
                    {results.length} inventory{" "}
                    {results.length === 1
                      ? "result was"
                      : "results were"}{" "}
                    identified for{" "}
                    {completedCustomer ||
                      "Mobile Walkthrough"}.
                  </Text>
                </View>

                <View style={styles.aiDisclaimerCard}>
                  <Text style={styles.aiDisclaimerIcon}>
                    i
                  </Text>

                  <Text style={styles.aiDisclaimerText}>
                    Review each item before confirming or finalizing.
                  </Text>
                </View>

                {emailSent && (
                  <View
                    style={styles.emailSuccessCard}
                  >
                    <Text
                      style={
                        styles.emailSuccessIcon
                      }
                    >
                      ✉
                    </Text>

                    <View
                      style={
                        styles.emailSuccessText
                      }
                    >
                      <Text
                        style={
                          styles.emailSuccessTitle
                        }
                      >
                        Workbook emailed
                      </Text>

                      <Text
                        style={
                          styles.emailSuccessDescription
                        }
                      >
                        The corrected workbook was
                        sent to {emailedRecipient}.
                      </Text>
                    </View>
                  </View>
                )}

                <View
                  style={styles.reviewProgressCard}
                >
                  <View
                    style={
                      styles.reviewProgressHeader
                    }
                  >
                    <View>
                      <Text
                        style={
                          styles.reviewProgressTitle
                        }
                      >
                        Review progress
                      </Text>

                      <Text
                        style={
                          styles.reviewProgressText
                        }
                      >
                        {confirmedCount} of{" "}
                        {results.length} items
                        confirmed
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.progressBadge,
                        allResultsConfirmed &&
                          styles.progressBadgeComplete,
                      ]}
                    >
                      <Text
                        style={[
                          styles.progressBadgeText,
                          allResultsConfirmed &&
                            styles.progressBadgeTextComplete,
                        ]}
                      >
                        {allResultsConfirmed
                          ? "Complete"
                          : `${confirmedCount}/${results.length}`}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={styles.progressTrack}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${progressPercent}%`,
                        },
                      ]}
                    />
                  </View>

                  {!allResultsConfirmed && (
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
                  )}
                </View>

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

                    const reviewReasons =
                      getReviewReasons(result);

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

                    const reviewReasons =
                      getReviewReasons(result);

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

        <View style={styles.footer}>
          {!hasResults ? (
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
          ) : (
            <>
              {!correctedWorkbookUrl && (
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
                        Finalize walkthrough
                      </Text>
                      <Text style={styles.finalizeSubtitle}>
                        View the report or email a copy
                      </Text>
                    </View>

                    <View style={styles.readyBadge}>
                      <Text style={styles.readyBadgeText}>Ready</Text>
                    </View>
                  </View>

                  <Pressable
                    disabled={isFinalizing}
                    onPress={() =>
                      finalizeWalkthrough(false)
                    }
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

                  <View style={styles.reportChoiceDivider}>
                    <View style={styles.reportChoiceLine} />
                    <Text style={styles.reportChoiceText}>
                      OR EMAIL A COPY
                    </Text>
                    <View style={styles.reportChoiceLine} />
                  </View>

                  <View style={styles.compactEmailRow}>
                    <TextInput
                      value={recipientEmail}
                      onChangeText={(value) => {
                        setRecipientEmail(value);
                        setEmailSent(false);
                        setEmailedRecipient("");
                      }}
                      editable={!isFinalizing}
                      placeholder="customer@example.com"
                      placeholderTextColor="#657891"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.compactEmailInput}
                    />

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
                      Cancel — Don’t Publish Results
                    </Text>
                  )}
                </Pressable>
              )}

              {correctedWorkbookUrl && (
                <Pressable
                  onPress={
                    openCorrectedWorkbook
                  }
                  style={({ pressed }) => [
                    styles.correctedButton,
                    pressed &&
                      styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={
                      styles.correctedButtonText
                    }
                  >
                    Open Corrected Workbook
                  </Text>
                </Pressable>
              )}

              {emailSent && originalWorkbookUrl && (
                <Pressable
                  onPress={
                    openOriginalWorkbook
                  }
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed &&
                      styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={
                      styles.secondaryButtonText
                    }
                  >
                    Open Original AI Workbook
                  </Text>
                </Pressable>
              )}

              {correctedWorkbookUrl && (
                <Pressable
                onPress={startOver}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed &&
                    styles.buttonPressed,
                ]}
              >
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Start New Walkthrough
                </Text>
              </Pressable>
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

                  <Pressable
                    onPress={saveEditedResult}
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
                      Save Changes
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
    backgroundColor: "#071421",
  },

  keyboardAvoidingView: {
    flex: 1,
  },

  screen: {
    flex: 1,
    backgroundColor: "#071421",
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

  title: {
    color: "#FFFFFF",
    fontSize: 30,
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
    fontSize: 11,
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
    fontSize: 10,
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
    fontSize: 11,
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
    fontSize: 11,
    fontWeight: "800",
  },

  unconfirmButton: {
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
    fontSize: 10,
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
    paddingHorizontal: 20,
    paddingTop: 9,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#1C2D43",
    backgroundColor: "#071421",
  },

  finalizeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#29445F",
    backgroundColor: "#0F1D2E",
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
    fontSize: 11,
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
    fontSize: 10,
    fontWeight: "900",
  },

  viewReportButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#176347",
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
    fontSize: 9,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#36506E",
    backgroundColor: "#112036",
    color: "#FFFFFF",
    fontSize: 14,
    paddingHorizontal: 12,
    marginRight: 9,
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
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7C3E49",
    backgroundColor: "#2A1720",
    marginTop: 10,
    paddingHorizontal: 14,
  },

  discardButtonText: {
    color: "#FFB6B6",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
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
    borderBottomColor: "#1C2D43",
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
    fontSize: 10,
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
    backgroundColor: "#071421",
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
