"use client";

// Receipts: downscaled JPEGs. With Supabase they live in a private Storage
// bucket and are shown through 60-second signed URLs; locally they are kept
// as data URLs in IndexedDB.

import { supabase } from "./supabase";
import { useStore } from "./store/store";

export async function compressImage(file: File, max = 1280): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.8));
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(b);
  });

/** Returns the value to store in `receipt_path`. */
export async function storeReceipt(file: File, txnId: string): Promise<string> {
  const blob = await compressImage(file);
  const sb = supabase();
  const userId = useStore.getState().userId;
  if (sb && userId) {
    const path = `${userId}/${txnId}.jpg`;
    const { error } = await sb.storage.from("receipts").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (!error) return `storage:${path}`;
  }
  return toDataUrl(blob);
}

export async function receiptUrl(receiptPath: string): Promise<string | null> {
  if (receiptPath.startsWith("data:")) return receiptPath;
  if (receiptPath.startsWith("storage:")) {
    const sb = supabase();
    if (!sb) return null;
    const { data } = await sb.storage.from("receipts").createSignedUrl(receiptPath.slice(8), 60);
    return data?.signedUrl ?? null;
  }
  return null;
}
