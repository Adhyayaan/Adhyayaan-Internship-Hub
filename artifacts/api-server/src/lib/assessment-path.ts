import type { AssessmentChoice } from "@workspace/api-zod";
import { assessmentV1 } from "../data/assessment-v1";
import { assessmentV2, selectItem, type Item, type Slot } from "../data/assessment-v2";

const legacyItems = [
  assessmentV1.reasoning, assessmentV1.habits, assessmentV1.confidence,
  assessmentV1.motivation, assessmentV1.interests,
].flat();
const legacySections = assessmentV1.sections.map(({ questions, ...section }) => ({
  ...section,
  slots: questions.map(q => ({ ...q, ...legacyItems.find(item => item.id === q.id)! })),
}));

type Section = { id: string; title: string; instructions: string; slots: Slot[] };
export const currentVersion = assessmentV2.version;

function sectionsFor(version: number): Section[] {
  if (version === assessmentV1.version) return legacySections;
  if (version === assessmentV2.version) return assessmentV2.sections;
  throw new Error("Unknown assessment version.");
}

export function assessmentSize(version: number) {
  const sections = sectionsFor(version);
  return { partCount: sections.length, questionCount: sections.reduce((sum, s) => sum + s.slots.length, 0) };
}

export function knownQuestion(version: number, id: string) {
  return sectionsFor(version).some(s => s.slots.some(slot => "length" in slot
    ? slot.some(item => item.id === id) : slot.id === id));
}

export function validOption(item: Item, choice: number) {
  return Number.isInteger(choice) && choice >= 0 && choice < item.options.length;
}

/** Replay a draft to reveal only answered questions and the next unanswered question in v2. */
export function assessmentPath(version: number, answers: AssessmentChoice[]) {
  const values = new Map(answers.map(a => [a.questionId, a.choice]));
  const kept: AssessmentChoice[] = [];
  const sections: Array<Omit<Section, "slots"> & { questions: Item[] }> = [];
  for (const { slots, ...section } of sectionsFor(version)) {
    const questions: Item[] = [];
    sections.push({ ...section, questions });
    let previous: Item | undefined;
    let previousChoice: number | undefined;
    for (const slot of slots) {
      const item = selectItem(slot, previous, previousChoice);
      questions.push(item);
      const choice = values.get(item.id);
      if (choice !== undefined && validOption(item, choice)) {
        kept.push({ questionId: item.id, choice });
        previous = item;
        previousChoice = choice;
      } else if (version !== assessmentV1.version) {
        return { sections, answers: kept };
      }
    }
  }
  return { sections, answers: kept };
}
