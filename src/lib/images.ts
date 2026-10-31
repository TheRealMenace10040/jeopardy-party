import { IMAGE_BUCKET, supabase } from './supabase';

const MAX_SIDE = 1600;

// Shrink photos before upload so they stay well under the 2 MB bucket limit.
async function downscale(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size < 1_900_000) return blob;
  }
  throw new Error('That photo is too large. Try a smaller one.');
}

export async function uploadImage(file: Blob): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in to add photos');
  const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`;
  const blob = await downscale(file);
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

// Short-lived link the TV can load; the bucket itself stays private.
export async function signedImageUrl(path: string | null, seconds = 6 * 3600): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

export async function imageAsDataUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(IMAGE_BUCKET).download(path);
  if (!data) return null;
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(data);
  });
}

export async function dataUrlToImage(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  return uploadImage(blob);
}
