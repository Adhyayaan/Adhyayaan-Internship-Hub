import { assessmentV2 } from "./assessment-v2";
import type { Item, Slot } from "./assessment-v2";

// Rewritten selections inspired by the uploaded 500-item draft.
// Its scenarios are reflective choices, not keyed or scored items.
const edits: Record<string, Partial<Item>> = {
  r1: {
    prompt: "What number comes next? 4, 7, 10, 13, …",
    options: ["16", "14", "18", "21"], correct: 0,
    explanation: "Each number increases by 3. 13 + 3 = 16.",
  },
  r2a: {
    prompt: "A study group has two packs of 12 cards and 5 loose cards. How many cards are there?",
    options: ["24", "17", "29", "31"], correct: 2,
    explanation: "Two packs have 24 cards. 24 + 5 = 29.",
  },
  r2b: {
    prompt: "What number comes next? 3, 9, 19, 33, …",
    options: ["49", "53", "56", "51"], correct: 3,
    explanation: "The gaps are 6, 10 and 14. The gap grows by 4, so the next gap is 18. 33 + 18 = 51.",
  },
  r3a: {
    prompt: "A learner solves half of 20 practice questions, then 5 more. How many questions have they solved?",
    options: ["10", "15", "20", "25"], correct: 1,
    explanation: "Half of 20 is 10. Then 10 + 5 = 15.",
  },
  r3b: {
    prompt: "A quiz gives 2 points for each of 16 correct answers and takes away 1 point for each of 15 wrong answers. What is the score?",
    options: ["15", "17", "19", "22"], correct: 1,
    explanation: "16 × 2 = 32 points. 32 − 15 = 17.",
  },
  r4a: {
    prompt: "A class records 14 minutes of reading on Monday and 12 minutes on Tuesday. What is the difference?",
    options: ["2 minutes", "6 minutes", "9 minutes", "4 minutes"], correct: 0,
    explanation: "14 − 12 = 2 minutes.",
  },
  r4b: {
    prompt: "A student spends 20 minutes reading, 21 minutes revising and 22 minutes practising. How many more minutes do reading and revision take together than practice?",
    options: ["16 minutes", "22 minutes", "19 minutes", "26 minutes"], correct: 2,
    explanation: "Reading and revision take 20 + 21 = 41 minutes. 41 − 22 = 19 minutes.",
  },
  r5a: {
    prompt: "There are 8 rows with 3 symbols in each row. How many symbols are there?",
    options: ["24", "19", "18", "27"], correct: 0,
    explanation: "8 rows × 3 symbols = 24 symbols.",
  },
  r5b: {
    prompt: "Three students solve 12, 9 and 7 questions. How many questions do they solve altogether?",
    options: ["29", "35", "28", "32"], correct: 2,
    explanation: "12 + 9 + 7 = 28 questions.",
  },
  r6a: {
    prompt: "Every librarian in this example can read maps. Mira is a librarian. What must be true?",
    options: ["Mira can read maps.", "Everyone who reads maps is a librarian.", "Mira is the only librarian.", "Mira cannot read maps."], correct: 0,
    explanation: "The first fact applies to every librarian, including Mira.",
  },
  r6b: {
    prompt: "All the tulips in a garden are flowers. No flowers in the garden are machines. What must be true?",
    options: ["Some tulips are machines.", "No tulips in the garden are machines.", "All flowers are tulips.", "Some machines are flowers."], correct: 1,
    explanation: "Every tulip is a flower, and no flower in the garden is a machine. So no tulip there is a machine.",
  },

  h1: { prompt: "Before I study, I choose one thing I want to learn." },
  h2a: { prompt: "After I read a short section, I try to recall one key idea without looking." },
  h2b: { prompt: "At the end of a study session, I explain the main idea without my notes." },
  h3a: { prompt: "I leave all my review until the day before a test.", reverse: true },
  h3b: { prompt: "Even when I have several days, I do most of my review on the last day.", reverse: true },
  c1: { prompt: "After a mistake, I can separate that result from what I can learn next." },
  c2a: { prompt: "When I need help, I ask one clear question." },
  c2b: { prompt: "When I get stuck, I explain what I tried and ask about the step I cannot do." },
  c3a: { prompt: "After disappointing feedback, I can choose one small next step." },
  c3b: { prompt: "After a setback, I try again with a different plan or ask for support." },
  m1: { prompt: "I explore subjects or activities that I do not know well yet." },
  m2a: { prompt: "When I stop partway through a task, I return and finish one more step." },
  m2b: { prompt: "After a break, I return to an unfinished task and follow my next planned step." },
  m3a: { prompt: "After trying something new, I think about what I learned." },
  m3b: { prompt: "When I learn something important, I review and update my goals." },

  i1: { prompt: "I would like to look for patterns in a table of results." },
  i2a: { prompt: "I would like to compare two sources and check which has stronger evidence." },
  i2b: { prompt: "I would like to compare several sources and explain why their findings differ." },
  i3: { prompt: "I would like to explain a difficult idea to a small group." },
  i4a: { prompt: "I would like to ask a classmate what support would help them start a task." },
  i4b: { prompt: "I would like to speak with a group and turn what I learn into a useful guide." },
  i5: { prompt: "I would like to build a simple tool that makes a task easier." },
  i6a: { prompt: "I would like to try a simple design and suggest one way to improve it." },
  i6b: { prompt: "I would like to test a tool with several people and improve it from their feedback." },
  i7: { prompt: "I would like to plan who does each task in a group project." },
  i8a: { prompt: "I would like to make a checklist for a small class activity." },
  i8b: { prompt: "I would like to make a project plan and checks to help a team finish on time." },
};

function revise(slot: Slot): Slot {
  if ("length" in slot) return slot.map(item => ({ ...item, ...edits[item.id] })) as unknown as Slot;
  return { ...slot, ...edits[slot.id] };
}

const item = (id: string, prompt: string, options: string[], followUpNotes: string[]): Item =>
  ({ id, prompt, options, followUpNotes });
const pair = (first: Item, second: Item): Slot => [first, second];

export const assessmentV3 = {
  version: 3,
  sections: [
    ...assessmentV2.sections.map(section => ({ ...section, slots: section.slots.map(revise) })),
    {
      id: "choices",
      title: "How you might respond",
      instructions: "Choose what you would try first. These situations have no scored right or wrong answer. Your choices help shape the next question and study tips.",
      slots: [
        item("sj1", "You read a chapter, but you cannot explain its main idea. What would you try first?",
          ["Close the book, explain what you remember, then check what you missed.",
            "Read a worked example, then explain the idea in your own words.",
            "Ask a teacher or classmate one clear question.",
            "Take a short break, then return to one part of the chapter."],
          ["You chose to recall the idea, then check what is missing.", "You chose to learn from an example and explain the idea.", "You chose to ask someone for focused help.", "You chose to take a short break and try one part at a time."]),
        pair(
          item("sj2a", "Which next step would help you check what you remember?",
            ["Write three key points from memory.", "Explain one paragraph in your own words.", "Answer one new practice question.", "Compare your explanation with the lesson."], []),
          item("sj2b", "Which next step would help you use the support you need?",
            ["Write down the part that is unclear.", "Ask someone to show one example.", "Choose one short section to review.", "Try explaining the idea after your break."], []),
        ),
        item("sj3", "A teammate misses a deadline and did not tell the group. What would you try first?",
          ["Ask what happened, then agree on the next step.", "Explain which task is delayed and ask what help is useful.", "Tell the group what is still needed and make a short recovery plan.", "Speak with the teammate privately before changing the plan."],
          ["You chose to check what happened and plan together.", "You chose to name the delay and ask what support would help.", "You chose to make the remaining work visible and plan the next steps.", "You chose to talk privately before the group changes its plan."]),
        pair(
          item("sj4a", "Which information would help your group plan the next step?",
            ["Which work is already complete.", "Which task depends on the missing work.", "How much time remains.", "What help the teammate needs."], []),
          item("sj4b", "How would you like to check that the new plan works?",
            ["Check progress at an agreed time.", "Ask each person to confirm their next task.", "Use a short checklist.", "Review what changed after the next task."], []),
        ),
        item("sj5", "You like a subject, but you do not know what people in that field do each day. What would you try?",
          ["Read a few real job or internship descriptions.", "Ask someone in the field what a normal workday is like.", "Try a small project that uses a skill from the field.", "Talk with a teacher or counsellor about ways to explore it."],
          ["You chose to start by reading about real roles.", "You chose to learn from someone with experience in the field.", "You chose to try a small project before deciding.", "You chose to discuss your options with a teacher or counsellor."]),
        pair(
          item("sj6a", "What detail would help you compare two roles?",
            ["The tasks people do each day.", "The skills each role uses.", "The kind of team or workplace.", "The training or experience needed."], []),
          item("sj6b", "What would help you judge whether a role fits your interests?",
            ["Try a small task like one used in that role.", "Ask about the parts of the work people find difficult.", "Compare work settings and daily tasks.", "Discuss pay, location and study needs with a counsellor."], []),
        ),
      ],
    },
  ],
};

