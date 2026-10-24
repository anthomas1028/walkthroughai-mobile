import { BarcodeScanner, type ScanLabelPhoto } from "../components/BarcodeScanner";
import { ScannedBarcodes } from "../components/ScannedBarcodes";
import { scanKey, type BarcodeScan } from "../lib/barcode-scans";
import { addAreaScan, type CapturedScan } from "../lib/capture-scans";
import { saveCaptureDraft } from "../lib/capture-drafts";
import { UI } from "../constants/design";
import { useConnection } from "../hooks/use-connection";
import { useAuth } from "../contexts/AuthContext";
import { draftKey, restoreGroups, storeGroups, writeDraft } from "../lib/drafts";
import { Alert } from "../lib/alerts";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,

  Image,
  KeyboardAvoidingView,
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

type SelectedPhoto = {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
  location: string;
  width: number;
  height: number;
  fileSize: number;
};

type LocationGroup = {
  id: string;
  name: string;
  photos: SelectedPhoto[];
  scans?: CapturedScan[];
};

type PhotoViewer = {
  uri: string;
  label: string;
};

type AreaModalMode = "create" | "rename";

type AreaModalState = {
  visible: boolean;
  mode: AreaModalMode;
  groupId: string | null;
};

const MAX_WALKTHROUGH_PHOTOS = 100;

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function WalkthroughPhotoScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const photoViewerImageHeight = Math.max(windowHeight - 120, 320);

  const { customerId, customerName, customerEmail, contactName } =
    useLocalSearchParams<{
      customerId?: string;
      customerName?: string;
      customerEmail?: string;
      contactName?: string;
    }>();

  const selectedCustomerName =
    typeof customerName === "string" && customerName.trim()
      ? customerName.trim()
      : "Selected Customer";

  const { session } = useAuth();
  const key = draftKey(session?.user.id || "", String(customerId || ""));
  const [draftReady, setDraftReady] = useState(false);
  const [groups, setGroups] = useState<LocationGroup[]>([]);
  const { connection } = useConnection();
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  useEffect(() => {
    if (!session) return;
    let alive = true;
    restoreGroups(key).then(saved => {
      if (!alive) return;
      if (saved?.length) Alert.alert("Saved walkthrough", "Restore the photos and locations saved on this device?", [
        { text: "Discard draft", style: "destructive", onPress: () => { void writeDraft(key, null); setDraftReady(true); } },
        { text: "Restore draft", onPress: () => { setGroups(saved); setDraftReady(true); } },
      ]); else setDraftReady(true);
    }).catch(() => { setDraftReady(true); Alert.alert("Draft recovery unavailable", "Device storage is unavailable. Keep the app open until your walkthrough is saved."); });
    return () => { alive = false; };
  }, [key]);
  useEffect(() => {
    if (!draftReady || !session) return;
    let active = true;
    setSaveStatus('saving');
    storeGroups(key, groups).then(async saved => { if (active && saved) { await saveCaptureDraft(session.user.id, { customerId: String(customerId || ''), customerName: selectedCustomerName, contactName: typeof contactName === 'string' ? contactName : '', photoCount: saved.reduce((count: number, group: LocationGroup) => count + group.photos.length, 0), scanCount: saved.reduce((count: number, group: LocationGroup) => count + (group.scans?.length || 0), 0) }); if (active) setSaveStatus('saved'); } }).catch(() => {
      if (active) { setSaveStatus('error'); Alert.alert("Draft could not be saved", "Device storage is full or unavailable. Keep the app open until you finish."); }
    });
    return () => { active = false; };
  }, [groups, key, draftReady]);
  useEffect(() => {
    if (Platform.OS !== "web" || !groups.some(group => group.photos.length || group.scans?.length)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [groups]);
  const [areaModal, setAreaModal] = useState<AreaModalState>({
    visible: false,
    mode: "create",
    groupId: null,
  });
  const [areaNameDraft, setAreaNameDraft] = useState("");
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [scanningArea, setScanningArea] = useState<string | null>(null);
  const [scannerEpoch, setScannerEpoch] = useState(0);
  const [isContinuing, setIsContinuing] = useState(false);
  const continueLock = useRef(false);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewer | null>(null);

  const areaInputRef = useRef<TextInput>(null);
  const photoViewerScrollRef = useRef<ScrollView>(null);
  const lastPhotoViewerTapTime = useRef(0);
  const photoViewerIsZoomed = useRef(false);

  const photos = useMemo(
    () => groups.flatMap((group) => group.photos),
    [groups]
  );

  const scanCount = groups.reduce((count, group) => count + (group.scans?.length || 0), 0);

  async function captureBarcode(groupId: string, scan: BarcodeScan, labelPhoto?: ScanLabelPhoto) {
    const current = groups.find(group => group.id === groupId);
    if (!current) throw new Error('This area is no longer available.');
    if (scanCount >= 100) throw new Error('This walkthrough already has 100 scans. Start another walkthrough for more.');
    if (current.scans?.some(value => scanKey(value) === scanKey(scan))) throw new Error('Already scanned in this area.');
    if (labelPhoto && photos.length >= MAX_WALKTHROUGH_PHOTOS) throw new Error('100-photo limit reached. Remove a photo or save the scan without a label photo.');
    const scanId = createId('barcode');
    const photoId = labelPhoto ? createId('scan-label') : undefined;
    const next = groups.map(group => {
      if (group.id !== groupId) return group;
      const updated = addAreaScan(group, scan, scanId);
      return { ...updated, scans: updated.scans?.map(value => value.id === scanId ? { ...value, labelPhotoId: photoId } : value), photos: labelPhoto ? [...group.photos, { id: photoId!, uri: labelPhoto.uri, width: labelPhoto.width, height: labelPhoto.height, location: group.name, fileName: `${photoId}.jpg`, mimeType: 'image/jpeg', fileSize: 0 }] : group.photos };
    });
    const saved = await storeGroups(key, next);
    if (!saved) throw new Error('The draft changed while saving. Scan again to confirm the item.');
    await saveCaptureDraft(session!.user.id, { customerId: String(customerId || ''), customerName: selectedCustomerName, contactName: typeof contactName === 'string' ? contactName : '', photoCount: next.reduce((count, group) => count + group.photos.length, 0), scanCount: next.reduce((count, group) => count + (group.scans?.length || 0), 0) });
    setGroups(saved);
  }

  function openCreateAreaModal() {
    setAreaNameDraft("");
    setAreaModal({ visible: true, mode: "create", groupId: null });
    setTimeout(() => areaInputRef.current?.focus(), 300);
  }

  function useUnassignedArea() {
    setGroups((current) => {
      const existingUnassigned = current.find(
        (group) => group.name.trim().toLowerCase() === "unassigned"
      );

      if (existingUnassigned) {
        return current;
      }

      return [
        ...current,
        {
          id: createId("area"),
          name: "Unassigned",
          photos: [],
        },
      ];
    });
  }

  function openRenameAreaModal(group: LocationGroup) {
    setAreaNameDraft(group.name);
    setAreaModal({ visible: true, mode: "rename", groupId: group.id });
    setTimeout(() => areaInputRef.current?.focus(), 300);
  }

  function closeAreaModal() {
    setAreaModal({ visible: false, mode: "create", groupId: null });
    setAreaNameDraft("");
  }

  function saveArea() {
    const cleanedName = areaNameDraft.trim();

    if (!cleanedName) {
      Alert.alert(
        "Enter an area name",
        "Use a name such as Maintenance Area, Production, or Shipping."
      );
      return;
    }

    const duplicateExists = groups.some(
      (group) =>
        group.id !== areaModal.groupId &&
        group.name.trim().toLowerCase() === cleanedName.toLowerCase()
    );

    if (duplicateExists) {
      Alert.alert("Area already exists", "Use a different area name.");
      return;
    }

    if (areaModal.mode === "rename" && areaModal.groupId) {
      setGroups((current) =>
        current.map((group) =>
          group.id === areaModal.groupId
            ? {
                ...group,
                name: cleanedName,
                photos: group.photos.map((photo) => ({
                  ...photo,
                  location: cleanedName,
                })),
              }
            : group
        )
      );
    } else {
      setGroups((current) => [
        ...current,
        {
          id: createId("area"),
          name: cleanedName,
          photos: [],
        },
      ]);
    }

    closeAreaModal();
  }

  function removeArea(group: LocationGroup) {
    const photoText =
      group.photos.length === 0
        ? ""
        : ` and its ${group.photos.length} selected ${
            group.photos.length === 1 ? "photo" : "photos"
          }`;

    Alert.alert(
      "Delete area?",
      `Delete ${group.name}${photoText}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            setGroups((current) =>
              current.filter((item) => item.id !== group.id)
            ),
        },
      ]
    );
  }

  function showAreaMenu(group: LocationGroup) {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Rename Area", "Delete Area"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          title: group.name,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) openRenameAreaModal(group);
          if (buttonIndex === 2) removeArea(group);
        }
      );
      return;
    }

    Alert.alert(group.name, "Choose an action", [
      { text: "Rename Area", onPress: () => openRenameAreaModal(group) },
      { text: "Delete Area", style: "destructive", onPress: () => removeArea(group) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function addAssetsToGroup(
    groupId: string,
    assets: ImagePicker.ImagePickerAsset[]
  ) {
    if (assets.some(asset => asset.width > 0 && asset.height > 0 && Math.min(asset.width, asset.height) < 700)) {
      Alert.alert("Check photo detail", "A photo has a short edge below 700 pixels. Zoom in to check that part numbers are readable; remove it and retake closer if needed. This checks resolution, not blur or lighting.");
    }
    {
      const currentGroups = groups;
      const currentCount = currentGroups.reduce(
        (total, group) => total + group.photos.length,
        0
      );
      const remainingSlots = MAX_WALKTHROUGH_PHOTOS - currentCount;

      if (remainingSlots <= 0) {
        Alert.alert(
          "100-photo limit reached",
          "Remove a photo before adding another one."
        );
        return;
      }

      const targetGroup = currentGroups.find((group) => group.id === groupId);
      if (!targetGroup) return;

      const existingUris = new Set(
        currentGroups.flatMap((group) => group.photos.map((photo) => photo.uri))
      );
      const uniqueAssets = assets.filter((asset) => !existingUris.has(asset.uri));
      const acceptedAssets = uniqueAssets.slice(0, remainingSlots);

      if (uniqueAssets.length > remainingSlots) {
        Alert.alert(
          "Some photos were not added",
          `WalkthroughAI supports up to ${MAX_WALKTHROUGH_PHOTOS} photos per walkthrough.`
        );
      }

      const newPhotos: SelectedPhoto[] = acceptedAssets.map((asset, index) => ({
        id: createId(`photo-${index}`),
        uri: asset.uri,
        fileName:
          asset.fileName ??
          `inventory-photo-${Date.now()}-${index + 1}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
        location: targetGroup.name,
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        fileSize: asset.fileSize ?? 0,
      }));

      const next = currentGroups.map((group) =>
        group.id === groupId
          ? { ...group, photos: [...group.photos, ...newPhotos] }
          : group
      );
      // Save original bytes and metadata before reporting a successful capture.
      setGroups(next);
      setSaveStatus('saving');
      try { await storeGroups(key, next); }
      catch { setSaveStatus('error'); Alert.alert('Photo save needs attention', 'The photo is visible, but could not be saved on this device. Keep the app open and free some storage.'); }
    }
  }

  async function takePhoto(groupId: string) {
    try {
      setIsOpeningPicker(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Camera permission needed",
          "Please allow camera access so WalkthroughAI can photograph inventory labels."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        await addAssetsToGroup(groupId, result.assets);
      }
    } catch (error) {
      console.error("Camera error:", error);
      Alert.alert("Camera error", "The camera could not be opened. Try again.");
    } finally {
      setIsOpeningPicker(false);
    }
  }

  async function choosePhotos(groupId: string) {
    try {
      setIsOpeningPicker(true);
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Photo permission needed",
          "Please allow photo-library access so you can select inventory photos."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: MAX_WALKTHROUGH_PHOTOS,
        orderedSelection: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        await addAssetsToGroup(groupId, result.assets);
      }
    } catch (error) {
      console.error("Photo-library error:", error);
      Alert.alert(
        "Photo-library error",
        "Your photos could not be opened. Try again."
      );
    } finally {
      setIsOpeningPicker(false);
    }
  }

  function removePhoto(groupId: string, photoId: string) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              photos: group.photos.filter((photo) => photo.id !== photoId),
              scans: group.scans?.map(scan => scan.labelPhotoId === photoId ? { ...scan, labelPhotoId: undefined } : scan),
            }
          : group
      )
    );
  }

  function openPhotoViewer(
    photo: SelectedPhoto,
    locationName: string,
    index: number,
    count: number
  ) {
    setPhotoViewer({
      uri: photo.uri,
      label: `${locationName} · Photo ${index + 1} of ${count}`,
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
    const currentTapTime = Date.now();
    const elapsed = currentTapTime - lastPhotoViewerTapTime.current;
    lastPhotoViewerTapTime.current = currentTapTime;

    if (elapsed <= 0 || elapsed > 320) return;

    lastPhotoViewerTapTime.current = 0;
    const shouldZoomIn = !photoViewerIsZoomed.current;
    const zoomScale = shouldZoomIn ? 2.5 : 1;
    const targetWidth = windowWidth / zoomScale;
    const targetHeight = photoViewerImageHeight / zoomScale;

    photoViewerScrollRef.current?.scrollResponderZoomTo({
      x: shouldZoomIn ? (windowWidth - targetWidth) / 2 : 0,
      y: shouldZoomIn ? (photoViewerImageHeight - targetHeight) / 2 : 0,
      width: targetWidth,
      height: targetHeight,
      animated: true,
    });

    photoViewerIsZoomed.current = shouldZoomIn;
  }

  async function continueToUpload() {
    if (!draftReady || continueLock.current) return;
    if (scanningArea !== null) {
      Alert.alert("Finish scanning?", "Continue with the photos and scans already saved. If a code is still waiting for Save & next, keep scanning and save it first.", [
        { text: "Keep scanning", style: "cancel" },
        { text: "Continue with saved items", onPress: () => void saveAndContinue() },
      ]);
      return;
    }
    await saveAndContinue();
  }

  async function saveAndContinue() {
    if (continueLock.current) return;
    continueLock.current = true;
    setIsContinuing(true);
    try {
      const saved = await storeGroups(key, groups);
      if (!saved) throw new Error("Draft changed while saving");
      // Unmount the camera before opening review, including on the back stack.
      setScanningArea(null);
      setScannerEpoch(value => value + 1);
      if (photos.length === 0 && scanCount === 0) {
        Alert.alert(
          "Add a photo or scan",
          "Add inventory photos or scan a barcode before continuing."
        );
        return;
      }

      router.push({
        pathname: "/upload",
        params: {
          photos: "",
          savedDraft: "true",
          customerId: typeof customerId === "string" ? customerId : "",
          customerName: selectedCustomerName,
          customerEmail:
            typeof customerEmail === "string" ? customerEmail : "",
          contactName: typeof contactName === "string" ? contactName : "",
        },
      });
    } catch {
      Alert.alert("Unable to save draft", "Keep the app open and try again. Device storage may be full.");
    } finally {
      continueLock.current = false;
      setIsContinuing(false);
    }
  }

  const locationSummary = `${groups.length} ${
    groups.length === 1 ? "area" : "areas"
  } · ${photos.length} ${photos.length === 1 ? "photo" : "photos"} · ${scanCount} scans`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons name="chevron-back" size={30} color="#FFFFFF" />
          </Pressable>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Inventory Photos</Text>
            <Text numberOfLines={1} style={styles.customerName}>
              {selectedCustomerName}
            </Text>
            <Text style={styles.headerSubtitle}>{locationSummary}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.toolbar}>
            <View style={styles.toolbarText}>
              <Text style={styles.toolbarTitle}>Areas</Text>
              <Text style={styles.toolbarSubtitle}>
                Group photos by where they were taken.
              </Text>
            </View>

            {groups.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={openCreateAreaModal}
                style={({ pressed }) => [
                  styles.addAreaButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons name="add" size={19} color="#FFFFFF" />
                <Text style={styles.addAreaButtonText}>Add Area</Text>
              </Pressable>
            ) : null}
          </View>

          {groups.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="location-outline" size={30} color="#93C5FD" />
              </View>
              <Text style={styles.emptyTitle}>No areas yet</Text>
              <Text style={styles.emptyText}>
                Create an area, then add the photos taken there.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={openCreateAreaModal}
                style={({ pressed }) => [
                  styles.addFirstAreaButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons name="add-circle-outline" size={21} color="#FFFFFF" />
                <Text style={styles.addFirstAreaButtonText}>Add First Area</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue without assigning an area"
                onPress={useUnassignedArea}
                style={({ pressed }) => [
                  styles.unassignedAreaButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons name="remove-circle-outline" size={20} color="#BFDBFE" />
                <Text style={styles.unassignedAreaButtonText}>
                  Continue Without Area
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.areaList}>
              {groups.map((group) => (
                <View key={group.id} style={styles.areaCard}>
                  <View style={styles.areaHeader}>
                    <View style={styles.areaHeaderText}>
                      <Text numberOfLines={1} style={styles.areaName}>
                        {group.name}
                      </Text>
                      <Text style={styles.areaMeta}>
                        {group.photos.length} {group.photos.length === 1 ? "photo" : "photos"} · {group.scans?.length || 0} scans
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`More options for ${group.name}`}
                      disabled={scanningArea !== null} onPress={() => showAreaMenu(group)}
                      style={({ pressed }) => [
                        styles.moreButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Ionicons name="ellipsis-horizontal" size={22} color="#AFC3DA" />
                    </Pressable>
                  </View>

                  {group.photos.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.thumbnailRow}
                    >
                      {group.photos.map((photo, index) => (
                        <View key={photo.id} style={styles.thumbnailCard}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Preview photo ${index + 1}`}
                            onPress={() =>
                              openPhotoViewer(
                                photo,
                                group.name,
                                index,
                                group.photos.length
                              )
                            }
                            style={({ pressed }) => [
                              styles.thumbnailButton,
                              pressed && styles.thumbnailPressed,
                            ]}
                          >
                            <Image
                              source={{ uri: photo.uri }}
                              resizeMode="cover"
                              style={styles.thumbnailImage}
                            />
                          </Pressable>

                          <View style={styles.photoIndexBadge}>
                            <Text style={styles.photoIndexText}>{index + 1}</Text>
                          </View>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove photo ${index + 1}`}
                            onPress={() => removePhoto(group.id, photo.id)}
                            style={({ pressed }) => [
                              styles.removePhotoButton,
                              pressed && styles.buttonPressed,
                            ]}
                          >
                            <Ionicons name="close" size={15} color="#FFFFFF" />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={styles.areaEmptyText}>
                      No photos added yet.
                    </Text>
                  )}

                  <View style={styles.photoActionRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Take a photo for ${group.name}`}
                      disabled={isOpeningPicker || scanningArea !== null}
                      onPress={() => void takePhoto(group.id)}
                      style={({ pressed }) => [
                        styles.photoActionButton,
                        styles.takePhotoButton,
                        pressed && styles.buttonPressed,
                        isOpeningPicker && styles.disabledButton,
                      ]}
                    >
                      <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.takePhotoButtonText}>Take Photo</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Choose photos for ${group.name}`}
                      disabled={isOpeningPicker || scanningArea !== null}
                      onPress={() => void choosePhotos(group.id)}
                      style={({ pressed }) => [
                        styles.photoActionButton,
                        styles.choosePhotosButton,
                        pressed && styles.buttonPressed,
                        isOpeningPicker && styles.disabledButton,
                      ]}
                    >
                      <Ionicons name="images-outline" size={20} color="#93C5FD" />
                      <Text style={styles.choosePhotosButtonText}>Choose Photos</Text>
                    </Pressable>
                  </View>
                  <BarcodeScanner key={`${group.id}-${scannerEpoch}`} continuous allowLabelPhoto existing={group.scans || []} otherScans={groups.filter(other => other.id !== group.id).flatMap(other => other.scans || [])}
                    blocked={!draftReady || isContinuing || isOpeningPicker || (scanningArea !== null && scanningArea !== group.id)}
                    title={`Scan in ${group.name}`} attachLabel="Save scan in this area" contextText="Scan, set quantity, and optionally photograph the same label. Save & next continues scanning. Works offline."
                    onBusy={busy => setScanningArea(busy ? group.id : null)} onAttach={(scan, photo) => captureBarcode(group.id, scan, photo)} />
                  <ScannedBarcodes scans={group.scans} onRemove={scanningArea === null ? scan => setGroups(current => current.map(area => area.id === group.id ? { ...area, scans: (area.scans || []).filter(value => scanKey(value) !== scanKey(scan)) } : area)) : undefined} />
                </View>
              ))}
            </View>
          )}

          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="sparkles-outline" size={20} color="#7CE3B8" />
            </View>
            <View style={styles.summaryTextWrap}>
              <Text style={styles.summaryMain}>
                {photos.length} photos · {scanCount} scans across {groups.length} {groups.length === 1 ? "area" : "areas"}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text accessibilityLiveRegion="polite" style={{ color: saveStatus === 'error' ? '#FCA5A5' : '#A9C9EF', fontSize: 12, textAlign: 'center', marginBottom: 8 }}>
            {saveStatus === 'saving' ? 'Saving photos on this device…' : saveStatus === 'error' ? 'Device save failed · keep the app open' : `${photos.length} photos · ${scanCount} scans saved on this device`}
            {connection === 'offline' ? '\nConnection unavailable · keep taking photos. Upload when connected.' : ''}
            {Platform.OS === 'web' ? '\nBrowser storage can be cleared by your browser.' : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={continueToUpload}
            disabled={!draftReady || isContinuing || isOpeningPicker || saveStatus === 'saving' || (photos.length === 0 && scanCount === 0)}
            style={({ pressed }) => [
              styles.continueButton,
              (!draftReady || isContinuing || isOpeningPicker || saveStatus === 'saving' || (photos.length === 0 && scanCount === 0)) && styles.continueButtonDisabled,
              pressed && (photos.length > 0 || scanCount > 0) && styles.buttonPressed,
            ]}
          >
            <Text
              style={[
                styles.continueButtonText,
                (photos.length === 0 && scanCount === 0) && styles.continueButtonTextDisabled,
              ]}
            >
              {isContinuing ? "Opening review…" : photos.length === 0 && scanCount === 0 ? "Add Photos or Scan a Barcode" : `Continue · ${photos.length} photos · ${scanCount} scans`}
            </Text>
          </Pressable>
        </View>

        <Modal
          visible={areaModal.visible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeAreaModal}
        >
          <SafeAreaView style={styles.modalSafeArea}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalKeyboardView}
            >
              <View style={styles.modalHeader}>
                <Pressable
                  accessibilityRole="button"
                  onPress={closeAreaModal}
                  style={({ pressed }) => [
                    styles.modalCancelButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>

                <Text style={styles.modalTitle}>
                  {areaModal.mode === "rename" ? "Rename Area" : "Add an Area"}
                </Text>

                <View style={styles.modalHeaderSpacer} />
              </View>

              <ScrollView
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
              >
                <View style={styles.modalIconWrap}>
                  <Ionicons name="location-outline" size={32} color="#93C5FD" />
                </View>
                <Text style={styles.modalPrompt}>Name this area</Text>
                <Text style={styles.modalHelp}>
                  Use the name people at this facility will recognize.
                </Text>

                <TextInput
                  ref={areaInputRef}
                  value={areaNameDraft}
                  onChangeText={setAreaNameDraft}
                  placeholder="Example: Maintenance Area"
                  placeholderTextColor="#6F829A"
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={saveArea}
                  style={styles.areaInput}
                />

                <Pressable
                  accessibilityRole="button"
                  onPress={saveArea}
                  style={({ pressed }) => [
                    styles.modalSaveButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.modalSaveButtonText}>
                    {areaModal.mode === "rename" ? "Save Name" : "Create Area"}
                  </Text>
                </Pressable>
              </ScrollView>
            </KeyboardAvoidingView>
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
          <View style={styles.photoViewerSafeArea}>
            <View
              style={[
                styles.photoViewerHeader,
                {
                  minHeight: 68 + safeAreaInsets.top,
                  paddingTop: safeAreaInsets.top,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={closePhotoViewer}
                style={({ pressed }) => [
                  styles.photoViewerCloseButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.photoViewerCloseText}>Close</Text>
              </Pressable>

              <View style={styles.photoViewerTitleArea}>
                <Text numberOfLines={1} style={styles.photoViewerTitle}>
                  {photoViewer?.label || "Selected Photo"}
                </Text>
                <Text style={styles.photoViewerHint}>Pinch or double-tap to zoom</Text>
              </View>

              <View style={styles.photoViewerHeaderSpacer} />
            </View>

            {photoViewer ? (
              <ScrollView
                ref={photoViewerScrollRef}
                style={styles.photoViewerScroll}
                contentContainerStyle={styles.photoViewerContent}
                centerContent
                minimumZoomScale={1}
                maximumZoomScale={5}
                onScroll={(event) => {
                  const zoomScale = event.nativeEvent.zoomScale;
                  if (typeof zoomScale === "number") {
                    photoViewerIsZoomed.current = zoomScale > 1.1;
                  }
                }}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
              >
                <Pressable
                  onPress={handlePhotoViewerTap}
                  style={{ width: windowWidth, height: photoViewerImageHeight }}
                >
                  <Image
                    source={{ uri: photoViewer.uri }}
                    resizeMode="contain"
                    style={styles.photoViewerImage}
                  />
                </Pressable>
              </ScrollView>
            ) : null}
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#091321",
  },
  screen: {
    flex: 1,
    backgroundColor: "#091321",
  },
  header: {
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: UI.screenPadding,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#26384E",
  },
  backButton: {
    width: UI.navigationSize,
    minHeight: 48,
    borderRadius: UI.cardRadius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#122034",
    borderWidth: 1,
    borderColor: "#2B3E59",
  },
  headerTextContainer: {minWidth: 0,
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {flexShrink: 1,
    color: "#FFFFFF",
    fontSize: UI.pageTitle,
    fontWeight: "800",
  },
  customerName: {
    color: "#60A5FA",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  headerSubtitle: {
    color: "#8FA1B9",
    fontSize: 13,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: UI.screenPadding,
    paddingTop: 18,
    paddingBottom: 24,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  toolbarText: {minWidth: 0,
    flex: 1,
    paddingRight: 12,
  },
  toolbarTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  toolbarSubtitle: {
    color: "#8FA1B9",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  addAreaButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#2D6BF0",
    paddingHorizontal: 12,
    gap: 5,
  },
  addAreaButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyState: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#0D1A2B",
    padding: 20,
  },
  emptyIconWrap: {
    width: 66,
    height: 66,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#132941",
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    marginTop: 18,
  },
  emptyText: {
    color: "#91A2B8",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  addFirstAreaButton: {
    minHeight: UI.controlHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: UI.cardRadius,
    backgroundColor: "#2D6BF0",
    paddingHorizontal: 20,
    marginTop: 22,
    gap: 8,
  },
  addFirstAreaButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  unassignedAreaButton: {
    minHeight: UI.controlHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: UI.cardRadius,
    backgroundColor: "#14263D",
    borderWidth: 1,
    borderColor: "#2B4A6A",
    paddingHorizontal: 20,
    marginTop: 12,
    gap: 8,
  },
  unassignedAreaButtonText: {
    color: "#BFDBFE",
    fontSize: 15,
    fontWeight: "800",
  },
  areaList: {
    gap: 14,
  },
  areaCard: {
    borderRadius: UI.cardRadius,
    backgroundColor: "#122033",
    padding: UI.cardPadding,
  },
  areaHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  areaHeaderText: {
    flex: 1,
  },
  areaName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  areaMeta: {
    color: "#9BAFC5",
    fontSize: 12,
    marginTop: 4,
  },
  moreButton: {
    width: 44,
    minHeight: 48,
    borderRadius: UI.cardRadius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16263A",
  },
  thumbnailRow: {
    gap: 10,
    paddingVertical: 15,
  },
  thumbnailCard: {
    width: 108,
    height: 108,
    borderRadius: UI.cardRadius,
    overflow: "hidden",
    backgroundColor: "#15243A",
  },
  thumbnailButton: {
    width: "100%",
    height: "100%",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailPressed: {
    opacity: 0.82,
  },
  photoIndexBadge: {
    position: "absolute",
    left: 7,
    bottom: 7,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    backgroundColor: "rgba(5, 15, 27, 0.86)",
  },
  photoIndexText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  removePhotoButton: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 15, 27, 0.90)",
  },
  areaEmptyText: {
    color: "#7F92A9",
    fontSize: 13,
    paddingVertical: 18,
  },
  photoActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoActionButton: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: UI.cardRadius,
    gap: 7,
  },
  takePhotoButton: {
    backgroundColor: "#2D6BF0",
  },
  choosePhotosButton: {
    backgroundColor: "#14263D",
    borderWidth: 1,
    borderColor: "#24405F",
  },
  takePhotoButtonText: {
    flexShrink: 1,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  choosePhotosButtonText: {
    flexShrink: 1,
    textAlign: "center",
    color: "#BFDBFE",
    fontSize: 13,
    fontWeight: "800",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: UI.cardRadius,
    backgroundColor: "#0F2824",
    padding: UI.cardPadding,
    marginTop: 18,
  },
  summaryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#153A32",
    marginRight: 12,
  },
  summaryTextWrap: {
    flex: 1,
  },
  summaryMain: {
    color: "#DDF9EE",
    fontSize: 14,
    fontWeight: "800",
  },
  footer: {
    paddingHorizontal: UI.screenPadding,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: "#091321",
    borderTopWidth: 1,
    borderTopColor: "#26384E",
  },
  continueButton: {
    minHeight: UI.controlHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: UI.cardRadius,
    backgroundColor: "#2D6BF0",
  },
  continueButtonDisabled: {
    backgroundColor: "#1A2A40",
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  continueButtonTextDisabled: {
    color: "#9BAFC5",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#091321",
  },
  modalKeyboardView: {
    flex: 1,
  },
  modalHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#26384E",
    paddingHorizontal: 16,
  },
  modalCancelButton: {
    width: 72,
    minHeight: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  modalCancelText: {
    color: "#93C5FD",
    fontSize: 14,
    fontWeight: "700",
  },
  modalTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  modalHeaderSpacer: {
    width: 72,
  },
  modalContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 40,
  },
  modalIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#132941",
    alignSelf: "center",
  },
  modalPrompt: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 22,
  },
  modalHelp: {
    color: "#91A2B8",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  areaInput: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "#111E31",
    color: "#FFFFFF",
    fontSize: 17,
    paddingHorizontal: 16,
    marginTop: 28,
  },
  modalSaveButton: {
    minHeight: UI.controlHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: UI.cardRadius,
    backgroundColor: "#2D6BF0",
    marginTop: 14,
  },
  modalSaveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
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
  disabledButton: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
});
