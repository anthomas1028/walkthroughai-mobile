import { downloadZip } from "client-zip";
import type { ArchiveEntries } from "./web-archive";

type SavePicker = (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;

function storageUnavailable(error: unknown) {
  return error instanceof DOMException &&
    ["SecurityError", "NotAllowedError", "NotSupportedError"].includes(error.name);
}

export async function saveWebArchive(name: string, entries: ArchiveEntries) {
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    let writable: FileSystemWritableFileStream | undefined;
    try {
      const file = await picker.call(window, { suggestedName: name });
      writable = await file.createWritable();
    } catch (error) {
      if (!storageUnavailable(error)) throw error;
    }
    if (writable) {
      await downloadZip(entries()).body!.pipeTo(writable);
      return;
    }
  }

  let removeTemporary: (() => Promise<void>) | undefined;
  try {
    let file: FileSystemFileHandle | undefined;
    let writable: FileSystemWritableFileStream | undefined;
    try {
      const directory = await navigator.storage?.getDirectory?.();
      if (directory) {
        const temporary = "wa-export-" + crypto.randomUUID();
        file = await directory.getFileHandle(temporary, { create: true });
        removeTemporary = () => directory.removeEntry(temporary).catch(() => {});
        writable = await file.createWritable?.();
      }
    } catch (error) {
      if (!storageUnavailable(error)) throw error;
    }

    const zip = downloadZip(entries());
    let blob: Blob;
    if (file && writable) {
      await zip.body!.pipeTo(writable);
      blob = await file.getFile();
    } else {
      blob = await zip.blob();
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    try {
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      const cleanup = removeTemporary;
      setTimeout(() => {
        URL.revokeObjectURL(url);
        void cleanup?.();
      }, 60000);
      removeTemporary = undefined;
    }
  } finally {
    await removeTemporary?.();
  }
}
