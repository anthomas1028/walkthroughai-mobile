import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
};

type PhotoViewer = {
  uri: string;
  label: string;
};

const MAX_WALKTHROUGH_PHOTOS = 100;
const MEASURED_SECONDS_PER_PHOTO = 2.8;

function formatEstimatedProcessingTime(photoCount: number): string {
  if (photoCount <= 0) {
    return "Add photos to see an estimate";
  }

  const estimatedSeconds = Math.max(
    15,
    Math.round(photoCount * MEASURED_SECONDS_PER_PHOTO)
  );

  if (estimatedSeconds < 60) {
    return `About ${estimatedSeconds} seconds`;
  }

  const minutes = Math.floor(estimatedSeconds / 60);
  const seconds = estimatedSeconds % 60;

  if (seconds === 0) {
    return `About ${minutes} ${
      minutes === 1 ? "minute" : "minutes"
    }`;
  }

  return `About ${minutes} min ${seconds} sec`;
}

function createPhotoId(uri: string, index: number) {
  return `${Date.now()}-${index}-${uri}`;
}

export default function WalkthroughPhotoScreen() {
  const { width: windowWidth, height: windowHeight } =
    useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const photoViewerImageHeight = Math.max(
    windowHeight - 120,
    320
  );

  const {
    customerId,
    customerName,
    customerEmail,
    contactName,
  } = useLocalSearchParams<{
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    contactName?: string;
  }>();

  const selectedCustomerName =
    typeof customerName === "string" && customerName.trim()
      ? customerName.trim()
      : "Selected Customer";

  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [photoViewer, setPhotoViewer] =
    useState<PhotoViewer | null>(null);
  const photoViewerScrollRef = useRef<ScrollView>(null);
  const lastPhotoViewerTapTime = useRef(0);
  const photoViewerIsZoomed = useRef(false);

  const estimatedProcessingTime =
    formatEstimatedProcessingTime(photos.length);

  const capacityPercent = Math.round(
    (photos.length / MAX_WALKTHROUGH_PHOTOS) * 100
  );

  async function takePhoto() {
    try {
      setIsOpeningPicker(true);

      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Camera permission needed",
          "Please allow camera access so Walkthrough AI can photograph inventory labels."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: false,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const newPhotos = result.assets.map((asset, index) => ({
        id: createPhotoId(asset.uri, index),
        uri: asset.uri,
        fileName:
          asset.fileName ??
          `inventory-photo-${Date.now()}-${index + 1}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
      }));

      setPhotos((currentPhotos) => {
        const remainingSlots =
          MAX_WALKTHROUGH_PHOTOS -
          currentPhotos.length;

        if (remainingSlots <= 0) {
          Alert.alert(
            "100-photo limit reached",
            "Remove a photo before adding another one."
          );

          return currentPhotos;
        }

        return [
          ...currentPhotos,
          ...newPhotos.slice(0, remainingSlots),
        ];
      });
    } catch (error) {
      console.error("Camera error:", error);

      Alert.alert(
        "Camera error",
        "Walkthrough AI could not open the camera. Please try again."
      );
    } finally {
      setIsOpeningPicker(false);
    }
  }

  async function choosePhotos() {
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

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          allowsEditing: false,
          quality: 0.85,
          selectionLimit: MAX_WALKTHROUGH_PHOTOS,
          orderedSelection: true,
        });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const newPhotos = result.assets.map((asset, index) => ({
        id: createPhotoId(asset.uri, index),
        uri: asset.uri,
        fileName:
          asset.fileName ??
          `inventory-photo-${Date.now()}-${index + 1}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
      }));

      setPhotos((currentPhotos) => {
        const existingUris = new Set(
          currentPhotos.map((photo) => photo.uri)
        );

        const uniqueNewPhotos = newPhotos.filter(
          (photo) => !existingUris.has(photo.uri)
        );

        const remainingSlots =
          MAX_WALKTHROUGH_PHOTOS -
          currentPhotos.length;

        if (remainingSlots <= 0) {
          Alert.alert(
            "100-photo limit reached",
            "Remove a photo before selecting another one."
          );

          return currentPhotos;
        }

        if (uniqueNewPhotos.length > remainingSlots) {
          Alert.alert(
            "Some photos were not added",
            `Walkthrough AI supports up to ${MAX_WALKTHROUGH_PHOTOS} photos per walkthrough.`
          );
        }

        return [
          ...currentPhotos,
          ...uniqueNewPhotos.slice(0, remainingSlots),
        ];
      });
    } catch (error) {
      console.error("Photo-library error:", error);

      Alert.alert(
        "Photo-library error",
        "Walkthrough AI could not open your photos. Please try again."
      );
    } finally {
      setIsOpeningPicker(false);
    }
  }

  function removePhoto(photoId: string) {
    setPhotos((currentPhotos) =>
      currentPhotos.filter((photo) => photo.id !== photoId)
    );
  }

  function openPhotoViewer(
    photo: SelectedPhoto,
    index: number
  ) {
    setPhotoViewer({
      uri: photo.uri,
      label: `Photo ${index + 1} of ${photos.length}`,
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
    const elapsedSinceLastTap =
      currentTapTime - lastPhotoViewerTapTime.current;

    lastPhotoViewerTapTime.current = currentTapTime;

    if (
      elapsedSinceLastTap <= 0 ||
      elapsedSinceLastTap > 320
    ) {
      return;
    }

    lastPhotoViewerTapTime.current = 0;

    const shouldZoomIn = !photoViewerIsZoomed.current;
    const zoomScale = shouldZoomIn ? 2.5 : 1;
    const targetWidth = windowWidth / zoomScale;
    const targetHeight = photoViewerImageHeight / zoomScale;

    photoViewerScrollRef.current?.scrollResponderZoomTo({
      x: shouldZoomIn
        ? (windowWidth - targetWidth) / 2
        : 0,
      y: shouldZoomIn
        ? (photoViewerImageHeight - targetHeight) / 2
        : 0,
      width: targetWidth,
      height: targetHeight,
      animated: true,
    });

    photoViewerIsZoomed.current = shouldZoomIn;
  }

  function removeAllPhotos() {
    Alert.alert(
      "Remove all photos?",
      "This will clear every selected inventory photo.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove All",
          style: "destructive",
          onPress: () => setPhotos([]),
        },
      ]
    );
  }

  function continueToUpload() {
    if (photos.length === 0) {
      Alert.alert(
        "Add at least one photo",
        "Take a new inventory photo or select one from your photo library before continuing."
      );
      return;
    }

    router.push({
      pathname: "/upload",
      params: {
        photos: JSON.stringify(photos),
        customerId:
          typeof customerId === "string" ? customerId : "",
        customerName: selectedCustomerName,
        customerEmail:
          typeof customerEmail === "string"
            ? customerEmail
            : "",
        contactName:
          typeof contactName === "string"
            ? contactName
            : "",
      },
    });
  }

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
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>
              Inventory Photos
            </Text>

            <Text
              numberOfLines={1}
              style={styles.customerName}
            >
              {selectedCustomerName}
            </Text>

            <Text style={styles.headerSubtitle}>
              {photos.length === 0
                ? "No photos selected"
                : `${photos.length} ${
                    photos.length === 1 ? "photo" : "photos"
                  } selected · ${MAX_WALKTHROUGH_PHOTOS} max`}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introCard}>
            <View style={styles.cameraIconContainer}>
              <Ionicons
                name="camera-outline"
                size={38}
                color="#FFFFFF"
              />
            </View>

            <Text style={styles.introTitle}>
              Add Inventory Photos
            </Text>

            <Text style={styles.introText}>
              Photograph labels, bins, boxes, packaging, and
              visible part information.
            </Text>

            <View style={styles.actionButtons}>
              <Pressable
                accessibilityRole="button"
                disabled={isOpeningPicker}
                onPress={takePhoto}
                style={({ pressed }) => [
                  styles.primaryAction,
                  pressed && styles.buttonPressed,
                  isOpeningPicker && styles.disabledButton,
                ]}
              >
                <View style={styles.primaryActionIconContainer}>
                  <Ionicons
                    name="camera"
                    size={27}
                    color="#FFFFFF"
                  />
                </View>

                <View style={styles.actionTextContainer}>
                  <Text style={styles.primaryActionTitle}>
                    Take Photo
                  </Text>

                  <Text style={styles.primaryActionSubtitle}>
                    Open your phone camera
                  </Text>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isOpeningPicker}
                onPress={choosePhotos}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  pressed && styles.buttonPressed,
                  isOpeningPicker && styles.disabledButton,
                ]}
              >
                <View style={styles.secondaryActionIconContainer}>
                  <Ionicons
                    name="images-outline"
                    size={27}
                    color="#93C5FD"
                  />
                </View>

                <View style={styles.actionTextContainer}>
                  <Text style={styles.secondaryActionTitle}>
                    Choose Photos
                  </Text>

                  <Text style={styles.secondaryActionSubtitle}>
                    Select up to 100 existing photos
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View style={styles.capacityCard}>
            <View style={styles.capacityTopRow}>
              <View style={styles.capacityCountBlock}>
                <Text style={styles.capacityLabel}>
                  Walkthrough size
                </Text>
                <Text style={styles.capacityValue}>
                  {photos.length} of {MAX_WALKTHROUGH_PHOTOS} photos
                </Text>
              </View>

              <View style={styles.estimateBadge}>
                <Text style={styles.estimateBadgeLabel}>
                  Estimated analysis
                </Text>
                <Text
                  numberOfLines={2}
                  style={styles.estimateBadgeValue}
                >
                  {estimatedProcessingTime}
                </Text>
              </View>
            </View>

            <View style={styles.capacityTrack}>
              <View
                style={[
                  styles.capacityFill,
                  {
                    width: `${Math.max(
                      0,
                      Math.min(capacityPercent, 100)
                    )}%`,
                  },
                ]}
              />
            </View>

            <Text style={styles.capacityNote}>
              Processing time may vary based on photo detail and
              complexity.
            </Text>
          </View>

          {photos.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>＋</Text>

              <Text style={styles.emptyTitle}>
                No inventory photos yet
              </Text>

              <Text style={styles.emptyText}>
                Your selected photos will appear here before
                they are sent for recognition.
              </Text>
            </View>
          ) : (
            <View style={styles.photoSection}>
              <View style={styles.photoSectionHeader}>
                <View>
                  <Text style={styles.photoSectionTitle}>
                    Selected Photos
                  </Text>

                  <Text style={styles.photoSectionSubtitle}>
                    Review each image before continuing.
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={removeAllPhotos}
                  style={({ pressed }) => [
                    styles.clearButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.clearButtonText}>
                    Clear All
                  </Text>
                </Pressable>
              </View>

              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <View
                    key={photo.id}
                    style={styles.photoCard}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Preview photo ${
                        index + 1
                      }`}
                      accessibilityHint="Opens the full-screen photo viewer"
                      onPress={() =>
                        openPhotoViewer(photo, index)
                      }
                      style={({ pressed }) => [
                        styles.photoPreviewButton,
                        pressed && styles.photoPreviewPressed,
                      ]}
                    >
                      <Image
                        source={{ uri: photo.uri }}
                        style={styles.photoImage}
                        resizeMode="cover"
                      />
                    </Pressable>

                    <View style={styles.photoNumber}>
                      <Text style={styles.photoNumberText}>
                        {index + 1}
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${
                        index + 1
                      }`}
                      onPress={() => removePhoto(photo.id)}
                      style={({ pressed }) => [
                        styles.removeButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.removeButtonText}>
                        ×
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.tipCard}>
            <View style={styles.tipIconContainer}>
              <Ionicons
                name="sparkles-outline"
                size={23}
                color="#93C5FD"
              />
            </View>

            <View style={styles.tipTextContainer}>
              <Text style={styles.tipTitle}>
                Photo tips
              </Text>

              <Text style={styles.tipText}>
                Clear photos create better results. Keep labels easy
                to read, avoid glare, and add a closer shot for small
                parts or details.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={continueToUpload}
            style={({ pressed }) => [
              styles.continueButton,
              photos.length === 0 &&
                styles.continueButtonDisabled,
              pressed &&
                photos.length > 0 &&
                styles.buttonPressed,
            ]}
          >
            <Text
              style={[
                styles.continueButtonText,
                photos.length === 0 &&
                  styles.continueButtonTextDisabled,
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
                accessibilityLabel="Close photo preview"
                onPress={closePhotoViewer}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.photoViewerCloseButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.photoViewerCloseText}>
                  Close
                </Text>
              </Pressable>

              <View style={styles.photoViewerTitleArea}>
                <Text
                  numberOfLines={1}
                  style={styles.photoViewerTitle}
                >
                  {photoViewer?.label || "Selected Photo"}
                </Text>
                <Text style={styles.photoViewerHint}>
                  Pinch or double-tap to zoom
                </Text>
              </View>

              <View style={styles.photoViewerHeaderSpacer} />
            </View>

            {photoViewer && (
              <ScrollView
                ref={photoViewerScrollRef}
                style={styles.photoViewerScroll}
                contentContainerStyle={styles.photoViewerContent}
                centerContent
                minimumZoomScale={1}
                maximumZoomScale={5}
                scrollEventThrottle={16}
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
                  accessibilityRole="imagebutton"
                  accessibilityLabel={photoViewer.label}
                  accessibilityHint="Double-tap to zoom"
                  onPress={handlePhotoViewerTap}
                  style={{
                    width: windowWidth,
                    height: photoViewerImageHeight,
                  }}
                >
                  <Image
                    source={{ uri: photoViewer.uri }}
                    resizeMode="contain"
                    style={styles.photoViewerImage}
                  />
                </Pressable>
              </ScrollView>
            )}
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
    paddingHorizontal: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1C2D43",
  },

  backButton: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#122034",
    borderWidth: 1,
    borderColor: "#2B3E59",
  },

  backArrow: {
    color: "#FFFFFF",
    fontSize: 48,
    lineHeight: 51,
    fontWeight: "300",
    marginTop: -5,
  },

  headerTextContainer: {
    flex: 1,
    marginLeft: 18,
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
    fontSize: 14,
    marginTop: 4,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 34,
  },

  introCard: {
    backgroundColor: "#111E31",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2A3E59",
    padding: 22,
  },

  cameraIconContainer: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: "#285BE0",
  },

  introTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 20,
  },

  introText: {
    color: "#A1AFC3",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    marginTop: 10,
  },

  actionButtons: {
    marginTop: 22,
    gap: 12,
  },

  primaryAction: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2D68EB",
    borderRadius: 18,
    paddingHorizontal: 18,
  },

  secondaryAction: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#17263A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#344A67",
    paddingHorizontal: 18,
  },

  primaryActionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    marginRight: 15,
  },

  secondaryActionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#102039",
    borderWidth: 1,
    borderColor: "#2D4D72",
    marginRight: 15,
  },

  actionTextContainer: {
    flex: 1,
  },

  primaryActionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  primaryActionSubtitle: {
    color: "#DDE8FF",
    fontSize: 13,
    marginTop: 4,
  },

  secondaryActionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  secondaryActionSubtitle: {
    color: "#96A7BD",
    fontSize: 13,
    marginTop: 4,
  },

  capacityCard: {
    backgroundColor: "#0D1A2B",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#263C58",
    padding: 16,
    marginTop: 16,
  },

  capacityTopRow: {
    gap: 12,
  },

  capacityCountBlock: {
    width: "100%",
  },

  capacityLabel: {
    color: "#8FA1B9",
    fontSize: 12,
    fontWeight: "700",
  },

  capacityValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
  },

  estimateBadge: {
    width: "100%",
    alignItems: "flex-start",
    backgroundColor: "#102A25",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#22634F",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  estimateBadgeLabel: {
    color: "#8FCBB7",
    fontSize: 10,
    fontWeight: "700",
  },

  estimateBadgeValue: {
    color: "#7CE3B8",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    marginTop: 2,
    flexShrink: 1,
  },

  capacityTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#1A2A40",
    overflow: "hidden",
    marginTop: 14,
  },

  capacityFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#2D68EB",
  },

  capacityNote: {
    color: "#8799B1",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },

  emptyCard: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D1A2B",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#263C58",
    borderStyle: "dashed",
    marginTop: 20,
    padding: 26,
  },

  emptyIcon: {
    color: "#58ABFF",
    fontSize: 52,
    fontWeight: "200",
  },

  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
  },

  emptyText: {
    color: "#91A2B8",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },

  photoSection: {
    marginTop: 24,
  },

  photoSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  photoSectionTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },

  photoSectionSubtitle: {
    color: "#899CB5",
    fontSize: 13,
    marginTop: 3,
  },

  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#2B1720",
    borderWidth: 1,
    borderColor: "#743244",
  },

  clearButtonText: {
    color: "#FF809C",
    fontSize: 13,
    fontWeight: "800",
  },

  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  photoCard: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#15243A",
    borderWidth: 1,
    borderColor: "#304B6A",
  },

  photoImage: {
    width: "100%",
    height: "100%",
  },

  photoPreviewButton: {
    width: "100%",
    height: "100%",
  },

  photoPreviewPressed: {
    opacity: 0.82,
  },

  photoNumber: {
    position: "absolute",
    left: 9,
    bottom: 9,
    minWidth: 31,
    height: 31,
    paddingHorizontal: 8,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6, 18, 31, 0.88)",
  },

  photoNumberText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  removeButton: {
    position: "absolute",
    right: 9,
    top: 9,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10, 20, 34, 0.92)",
    borderWidth: 1,
    borderColor: "#71829A",
  },

  removeButtonText: {
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 27,
    fontWeight: "500",
  },

  tipCard: {
    flexDirection: "row",
    backgroundColor: "#102039",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#294568",
    padding: 18,
    marginTop: 22,
  },

  tipIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#152D4A",
    borderWidth: 1,
    borderColor: "#2D527D",
    marginRight: 13,
  },

  tipTextContainer: {
    flex: 1,
  },

  tipTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  tipText: {
    color: "#9DAEC3",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: "#071421",
    borderTopWidth: 1,
    borderTopColor: "#1C2D43",
  },

  continueButton: {
    minHeight: 60,
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
    fontSize: 18,
    fontWeight: "800",
  },

  continueButtonTextDisabled: {
    color: "#71839C",
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
});
