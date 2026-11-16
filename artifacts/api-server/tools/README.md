# Consent pilot

The published lesson is **pre-rendered**, not regenerated on learner playback.
Its MP4, caption file, poster and original generated clips are in App Storage.
Files under `generated-artifacts/adhya-pilot/` are disposable local build outputs,
excluded from Git and publishing.

`consent-pilot-script.json` is the narration source. `consent-pilot.ts` contains
the measured chapter times and formative checkpoint content.

To rebuild:

1. Put the approved 1080p clips at `generated-artifacts/adhya-pilot/library-intro.mp4`
   and `fieldwork-choice.mp4` (the existing originals are also in the lesson's
   versioned App Storage directory).
2. Download Lato Bold to `generated-artifacts/adhya-pilot/Lato-Bold.ttf` from
   `https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Bold.ttf`.
3. From the workspace root, run:
   `pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/tools/build-consent-pilot.mts`.
   This generates AI narration (billable), renders the lesson and uploads it.
   Existing local narration files are reused; remove them explicitly if the
   corresponding script lines changed.
4. Compare the generated `timing.json` with `consent-pilot.ts`; update chapter and
   checkpoint times whenever narration changes. Captions use measured utterance
   durations rather than equal divisions of the whole video.
5. Bump the script's storage version for a changed release, keep the previous
   media intact, and publish the matching code only after checking all outputs.

The illustrated Adhya portrait has gentle composited motion, **not generated
lip-sync**. Library and fieldwork scenes are AI-generated footage. All scenarios
are fictional teaching examples; video viewing does not award internship hours.
