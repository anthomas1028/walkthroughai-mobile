export type ArchiveEntries = () => AsyncIterable<{ name: string; input: Uint8Array }>;
export async function saveWebArchive(_name: string, _entries: ArchiveEntries): Promise<void> {
  throw new Error("Browser export requires a web browser.");
}
