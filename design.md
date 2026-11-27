# Adhyayaan Design Guidelines

This document is the project-wide visual and interaction standard for Adhyayaan. Read it before changing a page, shared component, design token, or learning interaction. A feature is not ready until it works and reads well on both mobile and desktop.

## 1. Product and design intent

Adhyayaan is an AI-supported, project-based internship learning platform for final-year college students in West Bengal. Its design must feel:

- **Clear:** learners can tell where they are, what matters now, and what to do next.
- **Warm and credible:** supportive and human, without looking childish or overly formal.
- **Practical:** focused on study, supervised fieldwork, projects, reflection, and career growth.
- **Distinctive:** recognisably Adhyayaan, not a generic AI dashboard or template.
- **Accessible:** comfortable to read, navigate, and use on a phone, with assistive technology, and in supported languages.

The non-negotiable product principles are **cognitive learning and adaptive learning**. AI should support the learner throughout the journey; it must not feel like an isolated chatbot feature.

## 2. Brand foundation

### Colour

Use the design tokens in `artifacts/adhyayaan/src/index.css` as the source of truth. Do not introduce one-off colours when an existing token fits.

| Role | Current token | Use |
| --- | --- | --- |
| Warm page background | `--background` (`40 45% 95%`) | Main canvas; prefer this over stark white. |
| Dark ink / navy | `--primary` (`232 55% 28%`) | Main actions, navigation, and strong headings. |
| Main text | `--foreground` (`232 45% 16%`) | Body text and high-priority labels. |
| Warm card surface | `--card` (`42 60% 98%`) | Reading surfaces, cards, and form panels. |
| Coral | `--accent` (`12 78% 54%`) | A small number of active, important, or encouraging accents. |
| Turmeric | `--turmeric` (`40 88% 52%`) | Illustrative highlights and mentor details, not long text. |
| Ledger teal | `--ledger` (`178 42% 30%`) | Study and progress details where a second accent helps. |
| Borders | `--border` (`38 25% 84%`) | Quiet separation between surfaces and controls. |

Keep text contrast strong. Do not use coral, turmeric, or pale muted colours for long text or as the only way to show a status. Error, success, warning, and selected states must also have clear labels or icons. Avoid adding gradients, glows, or saturated colour blocks unless they have a clear purpose.

### Logo

- Use the approved `artifacts/adhyayaan/public/adhyayaan-logo.png` or `adhyayaan-mark.png` asset. Do not redraw, recolour, crop, stretch, or add effects to the logo.
- Preserve its aspect ratio and leave clear space around it. Use the mark when the full wordmark cannot fit.
- Give the logo useful alternative text when it links home; use empty alternative text when it is purely decorative beside an equivalent text label.
- Check the logo at narrow mobile widths and on both warm and dark surfaces before changing its container or background.

### Typography and language

- Use **Lato** for the main interface, as set by the current font tokens.
- Bengali glyphs need a Bengali-capable fallback. Check that Bengali text renders cleanly; do not let a missing glyph silently change the typeface or line height.
- Use a clear type scale: page title, section heading, supporting text, then labels and helper text. Avoid tiny all-caps text for important information.
- Keep paragraphs short, line length comfortable, and line height generous in study content.
- Write student-facing English in simple, direct language inspired by ASD-STE100. Do not claim formal compliance with that standard.
- Write Bengali for meaning and natural Indian classroom use, not sentence-by-sentence translation. Keep familiar academic terms when students use them, and explain less familiar terms simply.
- Keep text readable at 200% zoom. Do not use text as decoration when it makes the content harder to understand.

## 3. Layout and responsive behaviour

Design for phones first, then expand the layout for larger screens.

- Support narrow widths from **320 px** upward. Also check common phone widths around 360–430 px and a desktop width of at least 1280 px.
- Prevent horizontal page scrolling. Let long headings, labels, and Bengali text wrap naturally; never fix a text container so narrowly that words stack one character at a time.
- Use flexible widths, `min-width: 0` in grid/flex children where needed, and content-aware breakpoints. Avoid fixed-width cards and absolute positioning for essential content.
- At small widths, stack multi-column sections, simplify dense toolbars, and keep the primary action visible without hiding content.
- Keep the mobile navigation, floating mentor, dialogs, and sticky actions from covering the page’s main content. Respect safe-area insets and allow the page to scroll to the final field or action.
- Tables and charts must have a usable mobile treatment: reflow, summarize, or provide a deliberate horizontal scroll region. Do not make the whole page scroll sideways.
- Keep video and media at their intended aspect ratio. The pilot lesson uses widescreen 16:9.
- Preserve consistent alignment and spacing. Use the existing 4 px spacing rhythm rather than inventing unrelated values.

## 4. Components and interaction patterns

### Shared components

- Check `src/components/ui/` and `src/components/app/` before creating a new control or pattern. Extend shared components when the interaction is genuinely shared.
- Use the existing colour, radius, border, and focus tokens. Do not copy large blocks of page-specific CSS to create a second version of an existing component.
- A shared component must work in every context where it is used. If its API or appearance changes, inspect all affected routes.
- Keep component responsibilities small and names clear. Avoid building an entire page from one oversized component.

### Cards and sections

- Use cards to group related information, not to put a border around every item.
- Establish hierarchy with spacing, headings, and alignment before adding shadows or coloured backgrounds.
- Use a restrained border and soft elevation for raised surfaces. Reserve stronger emphasis for the most important next action.
- A clickable card must look and behave like one: provide hover, keyboard-focus, and pressed states, and do not nest competing links or buttons inside it.

### Buttons and actions

- Use one visually dominant primary action per section or decision point. Use secondary and quiet actions for alternatives.
- Button labels should say what will happen: for example, “Open study book” rather than “Continue”.
- Show loading, disabled, success, and error states. Prevent accidental repeat submissions where an action writes data.
- Keep controls easy to tap on a phone; target at least **44 × 44 px** for primary touch targets where practical.

### Forms and assessment

- Keep labels visible. Place instructions and errors beside the field they describe; do not rely on placeholder text alone.
- Preserve typed answers when validation fails. Explain what needs correction in plain language.
- Break long forms into clear steps and show progress without making the learner guess how much remains.
- Learning questionnaires must test understanding, application, and reasoning—not only recall—and use prior answers to adapt the next step.
- Psychometric and learning-profile screens must be respectful and non-diagnostic. Do not imply that reflective answers are objectively right or wrong, or present a profile as a clinical diagnosis or fixed ability.

### Study, projects, and AI

- Give the study book a clear reading hierarchy: module, lesson, objective, explanation, example, activity, and check for understanding.
- Make **Open study book** or the equivalent primary learning action visually prominent when it is the learner’s next step.
- Keep enrolled internships visually distinct from courses available to explore. Practice should show only enrolled courses.
- Integrate AI teaching into the learner’s current lesson, practice, project, or reflection. Preserve context when opening help; do not make the student repeat the question or navigate to a disconnected AI area.
- AI feedback should be grounded in the current lesson and help learners reason. It must not fabricate fieldwork, award internship hours, or imply official evaluation.
- Keep Adhya visually distinct from the page surface so the helper does not disappear into a pale background. The avatar and its panel must not cover important reading or controls. On mobile, use a compact launcher and a bounded, scrollable panel.
- Make video controls, captions, transcripts, and interactive checkpoints usable on touch screens and with a keyboard.

### Navigation and page states

- Keep page titles, selected navigation, breadcrumbs, and back actions consistent.
- Signed-out visitors should see the dedicated login/sign-up experience, not sample personal learning progress.
- For loading, empty, error, and success states, explain what happened and provide a relevant next step. Do not leave a blank region or a spinner with no context.
- Show destructive consequences before deletion or reset. Use confirmation for irreversible actions.

## 5. Visual quality and motion

- Prefer purposeful layouts, authentic learning context, and clear information hierarchy over decoration.
- Avoid generic “AI-generated” visual patterns: excessive gradients, glowing panels, floating glass cards, random abstract shapes, repeated pill labels, and decorative dashboards without a clear learner need.
- Use illustration, photography, or animation only when it helps teach, orient, or encourage. Avoid stereotyped or tokenistic depictions of Indian students and communities.
- Keep animation short and subtle. Motion should explain a state change or support learning, not delay the task.
- Respect `prefers-reduced-motion`. Do not rely on motion, colour, or sound alone to communicate meaning.
- Avoid autoplay with sound. Keep captions available for spoken video and offer a transcript for essential information.
- Use imagery at the correct aspect ratio and resolution. Avoid blurry, stretched, or mismatched assets.

## 6. Accessibility and usability

Before finishing a UI change, confirm:

- Text and controls have sufficient contrast. Do not rely on colour alone.
- Every input has a programmatic label; icon-only controls have accessible names.
- Focus is visible and moves in a logical order. Dialogs manage focus and can be closed with the keyboard when appropriate.
- Interactive elements work with keyboard and touch, not only hover.
- Images have meaningful alternative text or are marked decorative.
- Headings are in a useful order, buttons and links are used for their correct purpose, and status messages are announced.
- Reduced-motion preferences are respected.
- The page remains usable at 200% zoom and narrow viewport widths.

## 7. Change and review checklist

Before calling a UI change complete:

1. Read this guide and inspect the current page and shared components before editing.
2. Keep existing behaviour unless the request requires a change. Do not remove a feature or alter its meaning as an unintended side effect.
3. Check the change at **320–360 px**, **390–430 px**, and **1280 px or wider**.
4. Check relevant states: signed out/signed in, loading/empty/error/success, and keyboard focus.
5. Check long English and Bengali text, the logo, and mentor placement on mobile if the page uses them.
6. Confirm there is no horizontal page overflow, clipped content, overlapping controls, or hidden primary action.
7. Run the project type check (`pnpm run typecheck`) for code changes. Run relevant tests and check browser/workflow errors when behaviour or styling changes.
8. If a global token, shared component, typography rule, or navigation pattern changes, review all routes that depend on it and update this guide if the standard itself has changed.

Do not mark a visual change complete based only on a desktop screenshot or a successful build. Check the rendered interface at the sizes and states affected by the change.
