import { GetStudyBookResponse } from "@workspace/api-zod";
import { findCourse } from "./catalog";
import { communityChapters as sources } from "../data/study";
import { consentPilot } from "../data/consent-pilot";

const course = findCourse("01")!;
if (sources.length !== course.modules.length) throw new Error("Study chapters must match the source course plan.");
export const communityBook = GetStudyBookResponse.parse({
  courseId: "01",
  title: "Community Survey & Data Analysis",
  introduction: "Learn how to plan a survey, ask for consent, and explain your results. Follow an example about access to a public library. Read each lesson. Try the activity. Then explain the main idea in your own words. For the 60-hour internship, study chapters 1–10. For the 120-hour internship, also study chapters 11–16. Spend most of your internship time on practical work, not on videos.",
  editorialNote: "This study book is a draft. Your college and supervisor set the rules for ethics, safety and assessment. Use the links for further reading. They do not show college approval. The examples use made-up data. Do not submit them as fieldwork. Reading and AI feedback do not give you internship hours, grades or certificates. Each short video introduces a lesson idea.",
  modules: course.modules.map((m, index) => {
    const s = sources[index]!;
    return {
      id: m.id, title: m.title, extended: index >= 10,
      objectives: s.objectives,
      lessons: [
        { id: `${m.id}-a`, title: s.concept, minutes: Math.max(2, Math.ceil((s.sections.slice(0, 2).map(x => x.body).join(" ") + s.example).split(/\s+/).length / 170)), sections: s.sections.slice(0, 2), example: s.example, activity: `Before continuing, pause and explain the first learning objective in your own words: ${s.objectives[0]}. Use a short example of your own rather than copying the worked example.` },
        { id: `${m.id}-b`, title: s.practice, minutes: Math.max(2, Math.ceil((s.sections.slice(2).map(x => x.body).join(" ") + s.example).split(/\s+/).length / 170)), sections: s.sections.slice(2), example: s.example, activity: s.activity },
      ],
      imageUrl: `/api/study-media/01/${m.id}.svg`,
      imageAlt: `${m.title}: ${s.steps.map(x => `${x.heading}—${x.body}`).join(" Then ")}`,
      steps: s.steps,
      videoUrl: `/api/study-media/01/${m.id}.mp4`,
      transcript: [
        `Hi, I'm Adhya. Let's work through ${m.title}.`,
        ...s.steps.map((step, stepIndex) => `${["First", "Next", "Then", "Finally"][stepIndex] ?? "Now"}, ${step.heading}. ${step.body}`),
        `Before you move on, pause and think: ${s.questions.understand}`,
        "Try to explain your reasoning in your own words. You can pause here and use the study coach whenever you are ready.",
      ].join(" "),
      ...(index === 0 ? { pilotVideo: consentPilot } : {}),
      questions: s.questions,
      sourceUrls: s.sources,
    };
  }),
  progress: [], teaching: [],
});
export function getStudyContent(courseId: string) { return courseId === "01" ? communityBook : undefined; }
export function findStudyModule(moduleId: string) { return communityBook.modules.find(m => m.id === moduleId); }
