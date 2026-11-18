import { useRef, useState } from "react";
import { ActionSheetIOS, Platform, Pressable, Text, View } from "react-native";
import { saveWebArchive } from "../lib/web-archive";
import { PhotoZip } from "../lib/photo-zip";
import { Alert } from "../lib/alerts";

type Photo = { id?: string; uri: string; name: string; area?: string };
type Props = { photos: () => Photo[] | Promise<Photo[]>; archiveName?: string; resumeScope?: string };
const clean = (name: string) => name.replace(/[^a-zA-Z0-9_ -]/g, "_").trim().slice(0, 90) || "Photo";

async function readPhoto(uri: string) {
  if (Platform.OS !== "web" && uri.startsWith("file:")) {
    const { File } = await import("expo-file-system");
    return new File(uri).bytes();
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error("A photo could not be downloaded. Reopen the walkthrough and try again.");
  return new Uint8Array(await response.arrayBuffer());
}

function imageType(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216) return "jpg";
  if (bytes[0] === 137 && bytes[1] === 80) return "png";
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(8) === "WEBP") return "webp";
  if (tag(0).startsWith("GIF")) return "gif";
  if (tag(4) === "ftyp") return ["avif", "avis"].includes(tag(8)) ? "avif" : "heic";
  throw new Error("One of the photo files could not be recognized.");
}

export function PhotoExport({ photos, archiveName, resumeScope }: Props) {
  const lock = useRef(false);
  const [status, setStatus] = useState("");
  async function save(toPhotos = false) {
    if (lock.current) return;
    lock.current = true;
    setStatus("Preparing…");
    let cleanup: (() => void) | undefined;
    let close: (() => void) | undefined;
    try {
      if (Platform.OS === "web" && archiveName) {
        await saveWebArchive(clean(archiveName) + ".zip", async function* () {
          const list = await photos();
          if (!list.length) throw new Error("No photos are available.");
          const folders = new Map<string, string>();
          for (const [i, photo] of list.entries()) {
            setStatus(`Preparing ${i + 1} of ${list.length}…`);
            const input = await readPhoto(photo.uri);
            const area = photo.area || "Unassigned";
            if (!folders.has(area)) folders.set(area, `${folders.size + 1} - ${clean(area)}`);
            yield { name: `${folders.get(area)}/${String(i + 1).padStart(3, "0")} - ${clean(photo.name.replace(/\.[^.]+$/, ""))}.${imageType(input)}`, input };
          }
        });
        return;
      }
      const list = await photos();
      if (!list.length) throw new Error("There are no saved photos available for this walkthrough.");
      if (toPhotos) {
        const media = await import("expo-media-library");
        const permission = await media.requestPermissionsAsync(true);
        if (!permission.granted) {
          Alert.alert("Photos access needed", "Allow WalkthroughAI to add photos in iPhone Settings, then try again.");
          return;
        }
        const { Directory, File, Paths } = await import("expo-file-system");
        const dir = new Directory(Paths.cache, "photos-" + Date.now() + "-" + Math.random().toString(36).slice(2));
        dir.create();
        cleanup = () => dir.delete();
        const storage = (await import("@react-native-async-storage/async-storage")).default;
        const progressKey = archiveName && resumeScope ? "photo-export-v1:" + resumeScope : undefined;
        const savedIds = new Set<string>(progressKey ? JSON.parse(await storage.getItem(progressKey) || "[]") : []);
        let saved = 0;
        for (const [i, photo] of list.entries()) {
          const id = photo.id || photo.name;
          if (progressKey && savedIds.has(id)) { saved++; continue; }
          setStatus(`Saving ${i + 1} of ${list.length}…`);
          try {
            const bytes = await readPhoto(photo.uri);
            const file = new File(dir, `${i + 1}-${clean(photo.name.replace(/\.[^.]+$/, ""))}.${imageType(bytes)}`);
            file.create();
            file.write(bytes);
            await media.saveToLibraryAsync(file.uri);
            saved++;
            if (progressKey) {
              savedIds.add(id);
              await storage.setItem(progressKey, JSON.stringify([...savedIds]));
            }
            file.delete();
          } catch {
            Alert.alert("Save interrupted", `${saved} of ${list.length} saved to Photos. Tap the save button again to finish.`);
            return;
          }
        }
        if (progressKey) await storage.removeItem(progressKey);
        Alert.alert("Saved to Photos", `${saved} ${saved === 1 ? "photo" : "photos"} saved.`);
        return;
      }
      const first = archiveName ? undefined : await readPhoto(list[0].uri);
      const ext = first ? imageType(first) : "zip";
      const filename = clean(archiveName || list[0].name.replace(/\.[^.]+$/, "")) + "." + ext;
      let write: (bytes: Uint8Array) => void;
      let deliver: () => Promise<void>;
      if (Platform.OS === "web") {
        const parts: BlobPart[] = [];
        write = bytes => { parts.push(new Blob([bytes.slice().buffer])); };
        deliver = async () => {
          const url = URL.createObjectURL(new Blob(parts));
          const a = document.createElement("a");
          a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        };
      } else {
        const { Directory, File, Paths } = await import("expo-file-system");
        const sharing = await import("expo-sharing");
        if (!(await sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this device.");
        const dir = new Directory(Paths.cache, "export-" + Date.now() + "-" + Math.random().toString(36).slice(2));
        dir.create(); cleanup = () => dir.delete();
        const file = new File(dir, filename);
        file.create();
        const handle = file.open();
        write = bytes => handle.writeBytes(bytes);
        close = () => handle.close();
        deliver = () => sharing.shareAsync(file.uri, { mimeType: ext === "zip" ? "application/zip" : "image/" + (ext === "jpg" ? "jpeg" : ext), UTI: ext === "zip" ? "public.zip-archive" : ext === "jpg" ? "public.jpeg" : "public." + ext });
      }
      if (first) write(first);
      else {
        const zip = new PhotoZip(write);
        const folders = new Map<string, string>();
        for (const [i, photo] of list.entries()) {
          setStatus(`Preparing ${i + 1} of ${list.length}…`);
          const bytes = await readPhoto(photo.uri);
          const area = photo.area || "Unassigned";
          if (!folders.has(area)) folders.set(area, `${folders.size + 1} - ${clean(area)}`);
          zip.add(`${folders.get(area)}/${String(i + 1).padStart(3, "0")} - ${clean(photo.name.replace(/\.[^.]+$/, ""))}.${imageType(bytes)}`, bytes);
        }
        zip.finish();
      }
      close?.(); close = undefined;
      await deliver();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      Alert.alert("Photo export failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      try { close?.(); cleanup?.(); } finally { lock.current = false; setStatus(""); }
    }
  }
  const ios = Platform.OS === "ios";
  const label = ios
    ? (archiveName ? "Save All to Photos" : "Save to Photos")
    : (archiveName ? "Download All Photos (.zip)" : "Save Photo");
  return <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
    <Pressable accessibilityRole="button" disabled={!!status} onPress={() => save(ios)}
      style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 10 }}>
      <Text style={{ color: "#9bcaff", fontWeight: "700" }}>{status || label}</Text>
    </Pressable>
    {ios && archiveName && <Pressable accessibilityRole="button" accessibilityLabel="More photo export options"
      disabled={!!status} style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }}
      onPress={() => ActionSheetIOS.showActionSheetWithOptions({
        options: ["Download ZIP", "Cancel"], cancelButtonIndex: 1,
      }, index => { if (index === 0) void save(); })}>
      <Text style={{ color: "#9bcaff", fontSize: 20 }}>•••</Text>
    </Pressable>}
  </View>;
}
