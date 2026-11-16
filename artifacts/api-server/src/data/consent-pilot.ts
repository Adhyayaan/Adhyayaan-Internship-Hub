import type { PilotVideo } from "@workspace/api-zod";
import script from "./consent-pilot-script.json";

/** Timings measured from the generated audio, rounded to 24 fps scene boundaries. */
export const consentPilot: PilotVideo = {
  lessonId: script.lessonId,
  title: script.title,
  duration: 120.8333333333,
  videoUrl: "/api/study-media/01/consent-pilot.mp4",
  posterUrl: "/api/study-media/01/consent-pilot.jpg",
  captionsUrl: "/api/study-media/01/consent-pilot.vtt",
  transcript: script.scenes.map(scene => scene.lines.join(" ")).join("\n\n"),
  chapters: [
    { title: "Meet Adhya", start: 0, end: 12.5 },
    { title: "Notice the pressure", start: 12.5, end: 25.0833333333 },
    { title: "Make a prediction", start: 25.0833333333, end: 38.9166666667 },
    { title: "Explain without pressure", start: 38.9166666667, end: 54.1666666667 },
    { title: "Check understanding", start: 54.1666666667, end: 72 },
    { title: "Protect the answers", start: 72, end: 89.25 },
    { title: "Try a new situation", start: 89.25, end: 104.0833333333 },
    { title: "Take it into practice", start: 104.0833333333, end: 120.8333333333 },
  ],
  checkpoints: [
    {
      id: "voluntary-choice",
      at: 38.5,
      question: "The shopkeeper signed while serving customers. Why is that not enough to show voluntary consent?",
      hint: "Imagine the shopkeeper felt the college expected a yes. Would a signature tell you they understood the invitation or felt free to refuse?",
      explanation: "A signature records a response; it does not prove understanding or freedom from pressure. Explain participation, check comprehension, offer a genuine choice, and accept refusal without argument.",
      options: [
        { id: "signature", text: "A signature always proves that consent is informed and voluntary.", correct: false, feedback: "A mark on a form cannot tell you what someone understood or whether they felt pressured." },
        { id: "choice", text: "They may not have understood the study or felt free to decline.", correct: true, feedback: "Exactly. Look for understanding and a real, unpressured choice—not just agreement." },
        { id: "reward", text: "The student should promise a benefit to secure agreement.", correct: false, feedback: "Promising a benefit can add pressure. Approval for participation must not be bought with misleading promises." },
        { id: "busy", text: "Busy adults cannot ever give consent.", correct: false, feedback: "Being busy does not remove someone's ability to choose. Ask whether this is a convenient time and check understanding." },
      ],
    },
    {
      id: "leader-pressure",
      at: 103.7,
      question: "A community leader says everyone must answer. A resident then agrees. What should you do before collecting responses?",
      hint: "Who has power in this situation? Remove the expectation to comply before checking the resident's own choice.",
      explanation: "Pause recruitment. Clarify that participation is optional and will not affect services or benefits. Arrange an approved, pressure-free invitation and check the individual's understanding and choice. If pressure cannot be removed, consult your supervisor rather than proceeding.",
      options: [
        { id: "leader-permission", text: "Proceed: the leader's permission replaces each person's consent.", correct: false, feedback: "A leader cannot provide every adult's individual consent. Their authority may make refusal harder." },
        { id: "extra-signature", text: "Ask for two signatures and continue under the same conditions.", correct: false, feedback: "More paperwork does not remove social pressure or demonstrate understanding." },
        { id: "remove-pressure", text: "Pause, remove the pressure, and check each person's voluntary choice.", correct: true, feedback: "Yes. You have applied the principle to a new source of pressure, not just remembered a definition." },
        { id: "collect-first", text: "Collect the answers now and explain the right to refuse afterward.", correct: false, feedback: "An informed, voluntary choice must come before collection, not after it." },
      ],
    },
  ],
};

