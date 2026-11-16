---
name: App Storage SDK compatibility
description: Why this project keeps the template-compatible Google Cloud Storage SDK major
---
Keep the Replit sidecar App Storage client on the template-compatible Google Cloud Storage SDK 7.x unless a newer major is verified for both uploads and cold downloads.

**Why:** SDK 9 accepted uploads but failed a cold object download with “Unable to detect a Project Id” using the standard sidecar configuration. The template-compatible 7.x client successfully retrieved and checksum-verified the same assets without changing credential setup.

**How to apply:** Do not infer download compatibility from a successful upload. Verify an uncached download after any SDK major upgrade; keep the standard sidecar authentication configuration.
