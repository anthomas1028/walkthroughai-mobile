import { Platform } from "react-native";
export async function downloadInBrowser(url: string, fileName: string): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const response = await fetch(url);
  if (!response.ok) throw new Error("The report link expired or could not be downloaded. Refresh and try again.");
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return true;
}
