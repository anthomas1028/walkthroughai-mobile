import { downloadZip } from "client-zip";
import type { ArchiveEntries } from "./web-archive";

type SavePicker = (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;

export async function saveWebArchive(name: string, entries: ArchiveEntries) {
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    const file = await picker.call(window, { suggestedName: name });
    await downloadZip(entries()).body!.pipeTo(await file.createWritable());
    return;
  }

  // Spill to disk where supported. The file remains available while the download starts.
  const directory = await navigator.storage?.getDirectory?.();
  const temporary = "wa-export-" + crypto.randomUUID();
  let cleanLater = false;
  try {
    let blob: Blob;
    if (directory) {
      const file = await directory.getFileHandle(temporary, { create: true });
      if (typeof file.createWritable === "function") {
        await downloadZip(entries()).body!.pipeTo(await file.createWritable());
        blob = await file.getFile();
      } else {
        blob = await downloadZip(entries()).blob();
      }
    } else {
      blob = await downloadZip(entries()).blob();
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    cleanLater = true;
    setTimeout(() => {
      URL.revokeObjectURL(url);
      void directory?.removeEntry(temporary).catch(() => {});
    }, 60000);
  } finally {
    if (directory && !cleanLater) await directory.removeEntry(temporary).catch(() => {});
  }
}
