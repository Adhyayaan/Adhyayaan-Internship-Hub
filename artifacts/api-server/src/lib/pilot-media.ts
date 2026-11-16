import { mkdir, access, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { objectStorageClient } from "./app-storage-client";
import pilotScript from "../data/consent-pilot-script.json";

export const PILOT_STORAGE_VERSION = pilotScript.version;
export type PilotFile = "consent-pilot.mp4" | "consent-pilot.vtt" | "consent-pilot.jpg";
const pending = new Map<PilotFile, Promise<string>>();

/** Durable source in App Storage, disposable local cache for Express range serving. */
export async function getPilotMedia(file: PilotFile): Promise<string> {
  let download = pending.get(file);
  if (!download) {
    download = cachePilotMedia(file);
    pending.set(file, download);
    download.catch(() => pending.delete(file));
  }
  return download;
}
async function cachePilotMedia(file: PilotFile) {
  const prefix = process.env.PRIVATE_OBJECT_DIR;
  if (!prefix) throw new Error("Pilot lesson storage is not configured.");
  const [bucket, ...parts] = prefix.replace(/^\/+/, "").split("/");
  if (!bucket) throw new Error("Pilot lesson storage path is invalid.");
  const dir = path.join(tmpdir(), "adhyayaan-pilot", PILOT_STORAGE_VERSION);
  await mkdir(dir, { recursive: true });
  const local = path.join(dir, file);
  try { await access(local); return local; } catch { /* Fetch a missing cache from its durable source. */ }
  const temp = `${local}.${randomUUID()}.partial`;
  try {
    await objectStorageClient.bucket(bucket).file([...parts, "lessons", PILOT_STORAGE_VERSION, file].join("/")).download({ destination: temp });
    await rename(temp, local);
    return local;
  } finally {
    await rm(temp, { force: true });
  }
}
