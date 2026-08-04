import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
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
};

type LocationGroup = {
  id: string;
  name: string;
  photos: SelectedPhoto[];
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
const MEASURED_SECONDS_PER_PHOTO = 2.8;

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatEstimatedProcessingTime(photoCount: number): string {
  if (photoCount <= 0) return "Add photos to see an estimate";

  const estimatedSeconds = Math.max(
    15,
    Math.round(photoCount * MEASURED_SECONDS_PER_PHOTO)
  );

  if (estimatedSeconds < 60) return `About ${estimatedSeconds} seconds`;

  const minutes = Math.floor(estimatedSeconds / 60);
  const seconds = estimatedSeconds % 60;

  return seconds === 0
    ? `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}`
    : `About ${minutes} min ${seconds} sec`;
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

  const [groups, setGroups] = useState<LocationGroup[]>([]);
  const [areaModal, setAreaModal] = useState<AreaModalState>({
    visible: false,
    mode: "create",
    groupId: null,
  });
  const [areaNameDraft, setAreaNameDraft] = useState("");
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewer | null>(null);

  const areaInputRef = useRef<TextInput>(null);
  const photoViewerScrollRef = useRef<ScrollView>(null);
  const lastPhotoViewerTapTime = useRef(0);
  const photoViewerIsZoomed = useRef(false);

  const photos = useMemo(
    () => groups.flatMap((group) => group.photos),
    [groups]
  );

  const estimatedProcessingTime = formatEstimatedProcessingTime(photos.length);

  function openCreateAreaModal() {
    setAreaNameDraft("");
    setAreaModal({ visible: true, mode: "create", groupId: null });
    setTimeout(() => areaInputRef.current?.focus(), 300);
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

  function addAssetsToGroup(
    groupId: string,
    assets: ImagePicker.ImagePickerAsset[]
  ) {
    setGroups((currentGroups) => {
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
        return currentGroups;
      }

      const targetGroup = currentGroups.find((group) => group.id === groupId);
      if (!targetGroup) return currentGroups;

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
      }));

      return currentGroups.map((group) =>
        group.id === groupId
          ? { ...group, photos: [...group.photos, ...newPhotos] }
          : group
      );
    });
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
        addAssetsToGroup(groupId, result.assets);
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
        addAssetsToGroup(groupId, result.assets);
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

  function continueToUpload() {
    if (photos.length === 0) {
      Alert.alert(
        "Add at least one photo",
        "Create an area and add inventory photos before continuing."
      );
      return;
    }

    router.push({
      pathname: "/upload",
      params: {
        photos: JSON.stringify(photos),
        customerId: typeof customerId === "string" ? customerId : "",
        customerName: selectedCustomerName,
        customerEmail:
          typeof customerEmail === "string" ? customerEmail : "",
        contactName: typeof contactName === "string" ? contactName : "",
      },
    });
  }

  const locationSummary = `${groups.length} ${
    groups.length === 1 ? "area" : "areas"
  } · ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`;

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
                        {group.photos.length} {group.photos.length === 1 ? "photo" : "photos"}
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`More options for ${group.name}`}
                      onPress={() => showAreaMenu(group)}
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
                      disabled={isOpeningPicker}
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
                      disabled={isOpeningPicker}
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
                {photos.length} {photos.length === 1 ? "photo" : "photos"} across {groups.length} {groups.length === 1 ? "area" : "areas"}
              </Text>
              <Text style={styles.summarySub}>{estimatedProcessingTime}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={continueToUpload}
            style={({ pressed }) => [
              styles.continueButton,
              photos.length === 0 && styles.continueButtonDisabled,
              pressed && photos.length > 0 && styles.buttonPressed,
            ]}
          >
            <Text
              style={[
                styles.continueButtonText,
                photos.length === 0 && styles.continueButtonTextDisabled,
              ]}
            >
              {photos.length === 0
                ? "Add Photos to Continue"
                : `Continue with ${photos.length} ${
                    photos.length === 1 ? "Photo" : "Photos"
                  }`}
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
    backgroundColor: "#071421",
  },
  screen: {
    flex: 1,
    backgroundColor: "#071421",
  },
  header: {
    minHeight: 106,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#1C2D43",
  },
  backButton: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#122034",
    borderWidth: 1,
    borderColor: "#2B3E59",
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 25,
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
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 122,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  toolbarText: {
    flex: 1,
    paddingRight: 12,
  },
  toolbarTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
  },
  toolbarSubtitle: {
    color: "#8FA1B9",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  addAreaButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#2D68EB",
    paddingHorizontal: 12,
    gap: 5,
  },
  addAreaButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyState: {
    minHeight: 290,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#0D1A2B",
    padding: 28,
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
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#2D68EB",
    paddingHorizontal: 20,
    marginTop: 22,
    gap: 8,
  },
  addFirstAreaButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  areaList: {
    gap: 14,
  },
  areaCard: {
    borderRadius: 20,
    backgroundColor: "#0F1D2E",
    padding: 16,
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
    color: "#8093AA",
    fontSize: 12,
    marginTop: 4,
  },
  moreButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
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
    borderRadius: 15,
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
    fontSize: 11,
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
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    gap: 7,
  },
  takePhotoButton: {
    backgroundColor: "#2D68EB",
  },
  choosePhotosButton: {
    backgroundColor: "#14263D",
    borderWidth: 1,
    borderColor: "#24405F",
  },
  takePhotoButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  choosePhotosButtonText: {
    color: "#BFDBFE",
    fontSize: 13,
    fontWeight: "800",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 17,
    backgroundColor: "#0F2824",
    padding: 14,
    marginTop: 18,
  },
  summaryIconWrap: {
    width: 42,
    height: 42,
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
  summarySub: {
    color: "#7CE3B8",
    fontSize: 12,
    marginTop: 4,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: "#071421",
    borderTopWidth: 1,
    borderTopColor: "#1C2D43",
  },
  continueButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#2D68EB",
  },
  continueButtonDisabled: {
    backgroundColor: "#1A2A40",
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  continueButtonTextDisabled: {
    color: "#71839C",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#071421",
  },
  modalKeyboardView: {
    flex: 1,
  },
  modalHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1C2D43",
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
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "#2D68EB",
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
  disabledButton: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
});
