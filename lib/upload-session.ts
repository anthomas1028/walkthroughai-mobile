/** Reconcile server acknowledgements before transferring any photo. */
export async function recoverUploadSession<T extends { job_id?: string }>(options: {
  uploadId: string;
  photoCount: number;
  status: (id: string) => Promise<Response>;
  create: () => Promise<string>;
  checkpoint: (id: string, uploaded: number[]) => Promise<void>;
}): Promise<{ uploadId: string; uploaded: Set<number>; result?: T }> {
  let uploadId = options.uploadId;
  if (uploadId) {
    const response = await options.status(uploadId);
    if (response.ok) {
      const data = await response.json();
      if (data.photo_count !== options.photoCount) {
        throw new Error('The saved upload does not match these photos. Return to the saved walkthrough before continuing.');
      }
      const uploaded = (data.uploaded_slots || []).filter((slot: unknown) =>
        Number.isInteger(slot) && Number(slot) >= 0 && Number(slot) < options.photoCount);
      await options.checkpoint(uploadId, uploaded);
      return { uploadId, uploaded: new Set(uploaded), result: data.result };
    }
    // A missing/expired staging session is safe to replace. Authentication,
    // service failures and malformed responses must never start another job.
    if (response.status !== 404 && response.status !== 410) {
      throw new Error(`Could not check the saved upload (HTTP ${response.status}). Your photos are saved; retry when the connection returns.`);
    }
  }
  uploadId = await options.create();
  if (!uploadId) throw new Error('The server did not create an upload session.');
  await options.checkpoint(uploadId, []);
  return { uploadId, uploaded: new Set() };
}
