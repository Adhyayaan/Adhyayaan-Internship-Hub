# Adhyayaan

An AI-supported, project-based internship learning platform for final-year college students in West Bengal.

## Product requirements

- Support 60/120-hour pathways, practical projects, work logs, portfolio submission and evaluation preparation.
- See `.agents/memory/` for the user's standing learning and visual-quality requirements.
- Before any UI work, read and follow [`design.md`](design.md). Treat it as the shared visual, responsive, accessibility, and interaction standard for this project.

## Run & operate

- Use managed workflows `artifacts/api-server: API Server` and `artifacts/adhyayaan: web`.
- `pnpm run typecheck` checks libraries, apps and scripts.
- `pnpm --filter @workspace/api-spec run codegen` regenerates hooks and validation schemas.
- `pnpm --filter @workspace/db run push` updates development schema. Production schema changes use the Publish flow.
- `node lib/db/scripts/check-learning-assessment.mjs` checks the running development API against synthetic accounts. It removes the accounts and their test records when it finishes. Only run it with the development database and preview.
- `python3 scripts/import-course-plans.py` imports the supplied workbook archive without extracting archive paths into the project.
- AI uses Replit AI Integrations for OpenAI; no user API key is needed. Usage consumes Replit credits.

## Source of truth

- API contract: `lib/api-spec/openapi.yaml`.
- Database: `lib/db/src/schema/learning.ts` and `practice.ts`.
- Imported catalogue: `artifacts/api-server/src/data/courses.json`.
- Student UI: `artifacts/adhyayaan/src/pages/`, shared layout in `src/components/app/`.
- Frontend auth/cache helpers: `artifacts/adhyayaan/src/lib/app.ts`.
- Backend authentication: `artifacts/api-server/src/lib/auth.ts` and `routes/auth.ts`.
- Adaptive question generation and learner targeting: `artifacts/api-server/src/lib/adaptive.ts`.
- Authored study book: `artifacts/api-server/src/data/study/`, with reader at `/study/01`. Study progress and teaching responses use `lib/db/src/schema/study.ts`.

## Architecture and boundaries

- Custom password authentication uses salted scrypt hashes and opaque random session cookies; only token hashes are stored in PostgreSQL. User identity and ownership are server-derived.
- The dashboard is authenticated only; accounts begin empty. Signed-out visitors enter through dedicated login/sign-up pages rather than sample personal progress.
- Programmes and modules came from 30 course-build workbooks. These are planning blueprints, not finished accredited teaching materials. Draft hour allocations and extended pathways require academic review.
- INR500/1000 fees are indicative assumptions from the supplied portfolio, not payment-enabled enrolment. Pathway enrolment does not charge money or establish institutional approval.
- AI quizzes are formative, not official assessment. Five questions cover all three cognitive levels. Server-side answer keys remain private until submission; prior scores adjust difficulty and wrong answers target weak concepts.
- Community Survey has 16 authored teaching-draft chapters (32 lessons), instructional diagrams, controlled step animations, silent summary clips and lesson-grounded AI teach-back. Other courses remain plans; no course has academic approval. Official mentor evaluation, approval workflows, college acceptance, certificates, payment collection and email password recovery are not implemented.
- Reading positions, read/unread marks and bookmarks are private to the learner. Reading and formative teaching never award practical hours or mark supervised internship modules complete.
- Project submission requires all applicable modules, logged target hours, a valid project URL and a substantive reflection. Changing submitted work or deleting supporting logs resets submission status.

## Stack

- React/Vite, Tailwind, Wouter, React Query; Express 5 and PostgreSQL/Drizzle.
- OpenAPI/Orval generates typed hooks and Zod 3 schemas. Keep request bodies as named components.
- SDK client comes from `@workspace/integrations-openai-ai-server`; use server-side calls only.
- Do not store uploaded file bytes in PostgreSQL. Current projects submit portfolio/repository links, not file uploads.

## Operational notes

- All API traffic goes through `/api`; never hardcode backend ports in browser code.
- Clear **all** user-specific caches, including adaptive practice, when the session changes.
- HTTPS session cookies support the embedded preview. Mutation Origin checks protect against cross-site writes.
- Runtime SQL is parameterized through Drizzle. Never add startup DDL or production migration scripts.
- After backend changes restart the existing API workflow; frontend changes use the existing web workflow.
- New students must submit the learning assessment once. Accounts that were already present when the schema was applied can continue without taking it. Do not infer this distinction from signup dates or browser state.
- Learning reports are versioned educational snapshots, not IQ scores. Only study guidance goes to the AI personalisation prompt. Report reads through the admin panel are logged; drafts are never sent to the admin panel.

## Admin access

- Public signup creates a student account. No existing account is promoted by default. Use a separate account for administration.
- Ask the intended administrator to sign into that account and obtain its account `id` from `/api/auth/me`. Verify account ownership outside the app before granting access; the app does not verify email ownership.
- For development, run `pnpm --filter @workspace/db run admin-access grant ACCOUNT_ID` in the workspace shell after the schema is applied. To remove access, use `revoke` in place of `grant`. Use the account ID, not the email address. Sign in again to open **Admin** at `/admin`. The server checks access on each request.
- Provision production admin accounts separately after publishing the schema, using your production database's authorised operator access. A development admin grant does not grant access in production. Do not copy keys or database URLs into chat.
- Study clips are reproducible H.264 summaries rendered serially with `ffmpeg` and DejaVu Sans into a disposable temporary cache; no uploaded footage or persistent media store is required. Render failures are explicit and the transcript remains readable. Retain the renderer's runtime dependencies when publishing. App Storage provisioning failed during this build; do not assume it is configured.
