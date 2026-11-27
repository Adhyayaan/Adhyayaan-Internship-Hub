import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { File } from "@google-cloud/storage";
import { objectStorageClient } from "./app-storage-client";
import {
  isAllowedMentorshipAttachment,
  sanitizeMentorshipFileName,
} from "./mentorship-rules";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const UPLOAD_TTL_MS = 15 * 60 * 1000;

export interface MentorshipUploadClaims {
  enrollmentId: string;
  userId: string;
  objectPath: string;
  fileName: string;
  contentType: string;
  size: number;
  expiresAt: number;
}

function storageLocation(objectPath: string) {
  if (!objectPath.startsWith("/objects/mentor-chat/")) {
    throw new Error("Invalid mentorship attachment path.");
  }
  const objectId = objectPath.slice("/objects/mentor-chat/".length);
  if (!/^[0-9a-f-]{36}$/i.test(objectId)) {
    throw new Error("Invalid mentorship attachment path.");
  }
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("Private App Storage is not configured.");
  const [bucketName, ...prefix] = privateDir.replace(/^\/+|\/+$/g, "").split("/");
  if (!bucketName) throw new Error("Private App Storage path is invalid.");
  return {
    bucketName,
    objectName: [...prefix, "mentor-chat", objectId].filter(Boolean).join("/"),
  };
}

function getFile(objectPath: string): File {
  const { bucketName, objectName } = storageLocation(objectPath);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

function signClaims(claims: MentorshipUploadClaims): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Upload signing is not configured.");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyMentorshipUploadToken(
  token: string,
  expected: { enrollmentId: string; userId: string },
): MentorshipUploadClaims | null {
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret || token.length > 4096) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expectedSignature = createHmac("sha256", secret).update(payload).digest();
    const actualSignature = Buffer.from(signature, "base64url");
    if (actualSignature.length !== expectedSignature.length
      || !timingSafeEqual(actualSignature, expectedSignature)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MentorshipUploadClaims;
    if (claims.enrollmentId !== expected.enrollmentId
      || claims.userId !== expected.userId
      || claims.expiresAt <= Date.now()
      || !claims.objectPath.startsWith("/objects/mentor-chat/")
      || !isAllowedMentorshipAttachment(claims.contentType, claims.size)) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function createMentorshipUpload(
  input: { enrollmentId: string; userId: string; fileName: string; contentType: string; size: number },
) {
  const contentType = input.contentType.trim().toLowerCase();
  if (!isAllowedMentorshipAttachment(contentType, input.size)) {
    throw new Error("Unsupported file type or size.");
  }
  const { bucketName, objectName } = storageLocation(`/objects/mentor-chat/${randomUUID()}`);
  const expiresAt = Date.now() + UPLOAD_TTL_MS;
  const signed = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(expiresAt).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!signed.ok) throw new Error("Could not create a private upload link.");
  const result = await signed.json() as { signed_url?: string };
  if (typeof result.signed_url !== "string") throw new Error("Could not create a private upload link.");
  const objectId = objectName.split("/").at(-1);
  if (!objectId) throw new Error("Could not create a private upload path.");
  const claims: MentorshipUploadClaims = {
    enrollmentId: input.enrollmentId,
    userId: input.userId,
    objectPath: `/objects/mentor-chat/${objectId}`,
    fileName: sanitizeMentorshipFileName(input.fileName),
    contentType,
    size: input.size,
    expiresAt,
  };
  return {
    uploadUrl: result.signed_url,
    uploadToken: signClaims(claims),
    expiresAt: new Date(expiresAt),
  };
}

export async function verifyUploadedMentorshipFile(claims: MentorshipUploadClaims): Promise<boolean> {
  const file = getFile(claims.objectPath);
  const [exists] = await file.exists();
  if (!exists) return false;
  const [metadata] = await file.getMetadata();
  return Number(metadata.size) === claims.size
    && (metadata.contentType ?? "").toLowerCase() === claims.contentType;
}

export async function mentorshipObjectFile(objectPath: string): Promise<File | null> {
  const file = getFile(objectPath);
  const [exists] = await file.exists();
  return exists ? file : null;
}
