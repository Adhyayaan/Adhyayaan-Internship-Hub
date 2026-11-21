import { assessmentV1 } from "./assessment-v1";

// Keep prompt, option order, keys and branching stable for saved v2 drafts.
const [reasoning, habits, confidence, motivation, interests] = assessmentV1.sections;
const frequency = habits!.questions[0]!.options;
const interest = interests!.questions[0]!.options;
export type Item = { id: string; prompt: string; options: readonly string[]; correct?: number; explanation?: string; reverse?: boolean; group?: typeof assessmentV1.interests[number]["group"] };
export type Slot = Item | readonly [Item, Item];
const pair = (first: Item, second: Item): Slot => [first, second];
const reason = (id: string, prompt: string, options: string[], correct: number, explanation: string): Item =>
  ({ id, prompt, options, correct, explanation });
const rating = (id: string, prompt: string, reverse = false): Item => ({ id, prompt, options: frequency, reverse });
const activity = (id: string, prompt: string, group: NonNullable<Item["group"]>): Item =>
  ({ id, prompt, options: interest, group });

export const assessmentV2 = {
  version: 2,
  sections: [
    { ...reasoning!, slots: [
      assessmentV1.reasoning[0]!,
      pair(
        reason("r2a", "You must read the instructions before you start an activity. What should you do first?",
          ["Do the activity.", "Read the instructions.", "Write the results.", "Ask for a grade."], 1,
          "The instructions come before the activity."),
        reason("r2b", "Your team can print a poster only after the text and pictures are ready. The text is ready. The pictures need approval before you can use them. What is still needed before printing?",
          ["Print the poster.", "Rewrite the text.", "Check the printer ink only.", "Get approval for the pictures."], 3,
          "The text is ready, but printing depends on the pictures too. Get them approved first."),
      ),
      pair(
        reason("r3a", "One team completes 6 of 10 interviews. Another completes 4 of 10. Which team completes more of its target?",
          ["The first team.", "The second team.", "Both complete the same share.", "There is not enough information."], 0,
          "Both targets are 10. Six out of ten is more than four out of ten."),
        reason("r3b", "One team completes 18 of 30 checks. Another completes 21 of 35. Which team completes a larger share of its target?",
          ["The first team.", "The second team.", "They complete the same share.", "You cannot compare the totals."], 2,
          "Both fractions simplify to 3 out of 5, or 60%."),
      ),
      pair(
        reason("r4a", "You change a lamp and move a plant closer to a window on the same day. The plant grows faster. Can you tell which change helped?",
          ["Yes, it was the lamp.", "No, both things changed together.", "Yes, it was the window.", "Yes, neither change helped."], 1,
          "Two things changed together. This result does not tell you which helped."),
        reason("r4b", "Students who choose to join a study group score higher than those who do not. What would best test whether the group improves scores?",
          ["Ask group members if they like it.", "Count the group members again.", "Compare only the top scores.", "Assign volunteers to both groups by chance and give them the same test."], 3,
          "Assignment by chance reduces differences caused by who chooses to join. The same test makes the results easier to compare."),
      ),
      pair(
        reason("r5a", "A class list has 8 students marked present and 2 marked absent. A note says 8 students were absent. What should you check?",
          ["Which count the note used.", "The colour of the note.", "The room number.", "How many pages it has."], 0,
          "The note appears to use the present count in place of the absent count."),
        reason("r5b", "A table says 12 of 20 students use the bus. It shows this as 70%. What should you check first?",
          ["Whether the students like the bus.", "Whether the table uses the right font.", "Whether 12 ÷ 20 was calculated correctly.", "Whether other classes use the bus."], 2,
          "12 ÷ 20 is 0.6, or 60%. Check the calculation before drawing a conclusion."),
      ),
      pair(
        reason("r6a", "You learned how to check whether a claim has evidence. How can you check if you can use that skill?",
          ["Copy the lesson title.", "Check a new claim and explain what supports it.", "Reread the old example only.", "Count the sentences in the lesson."], 1,
          "Checking a new claim shows whether you can use the skill outside the example you studied."),
        reason("r6b", "You learned how to check if a survey represents a class. Which activity best tests whether you can use that idea in a different subject?",
          ["Memorise the meaning of a survey.", "Explain the same example without notes.", "Read an article about different surveys.", "Review a town survey and explain who its results may leave out."], 3,
          "The town survey is a different setting. Identifying who is missing shows you can apply the idea there."),
      ),
    ] },
    { ...habits!, slots: [
      rating("h1", assessmentV1.habits[0]!.prompt),
      pair(rating("h2a", "After reading a short section, I try to recall one key idea without looking."),
        rating("h2b", "At the end of a study session, I try to explain the main idea without my notes.")),
      pair(rating("h3a", "I leave all my review until the day before a test.", true),
        rating("h3b", "Even when I have several days, I leave most of my review until the last day.", true)),
    ] },
    { ...confidence!, slots: [
      rating("c1", assessmentV1.confidence[0]!.prompt),
      pair(rating("c2a", "When I get stuck, I tell someone which step I need help with."),
        rating("c2b", "When I need help, I explain what I tried and ask about the step I cannot do.")),
      pair(rating("c3a", "After a wrong answer, I try a different way to do the task."),
        rating("c3b", "When my first method fails, I use what I learnt from the mistake to try another method.")),
    ] },
    { ...motivation!, slots: [
      rating("m1", assessmentV1.motivation[0]!.prompt),
      pair(rating("m2a", "When I stop partway through a task, I go back and finish one more step."),
        rating("m2b", "After a break, I return to an unfinished task and continue with my next planned step.")),
      pair(rating("m3a", "When someone gives me feedback, I pick one thing to practise."),
        rating("m3b", "When I get feedback, I use it to choose the next skill I will practise.")),
    ] },
    { ...interests!, slots: [
      activity("i1", assessmentV1.interests[0].prompt, "data"),
      pair(activity("i2a", "Check which of two sources gives better evidence for an everyday claim.", "data"),
        activity("i2b", "Check several sources and explain why their findings differ.", "data")),
      activity("i3", assessmentV1.interests[2].prompt, "people"),
      pair(activity("i4a", "Ask a classmate what information would help them start a new task.", "people"),
        activity("i4b", "Interview a small group and turn what you learn into a guide they can use.", "people")),
      activity("i5", assessmentV1.interests[4].prompt, "build"),
      pair(activity("i6a", "Try a simple design and suggest one change to make it easier to use.", "build"),
        activity("i6b", "Test a tool with several people and change the design based on their feedback.", "build")),
      activity("i7", assessmentV1.interests[6].prompt, "organise"),
      pair(activity("i8a", "Write a checklist for a small class activity.", "organise"),
        activity("i8b", "Create a checklist and review plan to help a project team finish on time.", "organise")),
    ] },
  ].map(({ questions: _questions, ...section }) => section),
};

export function selectItem(slot: Slot, previous: Item | undefined, choice: number | undefined): Item {
  if (!("length" in slot)) return slot;
  if (!previous || choice === undefined) throw new Error("Adaptive follow-up has no previous answer.");
  const high = previous.correct !== undefined ? choice === previous.correct : choice >= 3;
  return slot[high ? 1 : 0];
}
