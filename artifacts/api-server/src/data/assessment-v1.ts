// Keep v1 prompts, option order and score keys stable. Add a new version for revisions.
const frequency = ["Never", "Rarely", "Sometimes", "Often", "Almost always"];
const interest = ["Not at all", "A little", "Somewhat", "Quite a lot", "Very much"];

const reasoning = [
  { id: "r1", prompt: "A class asks only its sports team how all students travel to college. Why might the answers not describe the whole class?", options: [
    "The team must give wrong answers.", "The team may travel differently from other students.", "Travel methods never change.", "A larger team makes the question unclear.",
  ], correct: 1, explanation: "The group you ask should include the people you want to describe. The team might not represent other students." },
  { id: "r2", prompt: "A lab task has three steps. You must label the samples before you measure them. You must measure them before you record the results. Which step can you do first?", options: [
    "Record the results.", "Measure the samples.", "Label the samples.", "Any of the three steps.",
  ], correct: 2, explanation: "Labelling has no earlier step in this task. It must come before measuring and recording." },
  { id: "r3", prompt: "Your team completes 12 out of 20 interviews. Another team completes 16 out of 40. Which team completes a larger share of its target?", options: [
    "Your team.", "The other team.", "Both complete the same share.", "The shares cannot be compared.",
  ], correct: 0, explanation: "Your team completes 12 ÷ 20 = 60%. The other team completes 16 ÷ 40 = 40%. Compare the shares, not just the counts." },
  { id: "r4", prompt: "Two groups study the same topic. One group gets more time and uses a new study method. This group scores higher. What can you conclude?", options: [
    "The new study method caused the higher scores.", "More time was the only cause.", "The old method does not work.", "The result does not show which difference caused the higher scores.",
  ], correct: 3, explanation: "Both the study time and the method changed. The result alone cannot tell you which change mattered." },
  { id: "r5", prompt: "A table shows 30 students: 18 have submitted a project and 12 have not. The report says 18 students have not submitted. What should you check first?", options: [
    "Whether all students used the same font.", "Which column the report used for the count.", "Whether the report is long enough.", "Whether 30 is an even number.",
  ], correct: 1, explanation: "The report may have used the count from the wrong column. Compare its wording and count with the table." },
  { id: "r6", prompt: "You learn one example of how to spot an unreliable source. Which activity best checks if you can use that idea in a new situation?", options: [
    "Read the same example again.", "Copy its exact wording.", "Compare two new sources and explain which you trust.", "Count the headings in each source.",
  ], correct: 2, explanation: "A new comparison tests whether you can apply the idea, not just remember the example." },
];

const habits = [
  { id: "h1", prompt: "Before I study, I choose one thing I want to learn.", reverse: false },
  { id: "h2", prompt: "I close my notes and try to explain what I remember.", reverse: false },
  { id: "h3", prompt: "I wait until the last day to review what I learnt.", reverse: true },
];
const confidence = [
  { id: "c1", prompt: "I try a small first step when a task looks difficult.", reverse: false },
  { id: "c2", prompt: "I ask a specific question when I need help.", reverse: false },
  { id: "c3", prompt: "After a mistake, I try again with a different approach.", reverse: false },
];
const motivation = [
  { id: "m1", prompt: "I connect what I study to something I want to do.", reverse: false },
  { id: "m2", prompt: "I return to a task after a break to finish the next step.", reverse: false },
  { id: "m3", prompt: "I use feedback to choose what to practise next.", reverse: false },
];
const interests = [
  { id: "i1", prompt: "Look for patterns in a table of results.", group: "data" },
  { id: "i2", prompt: "Compare sources to check whether a claim is reliable.", group: "data" },
  { id: "i3", prompt: "Explain a difficult idea to a small group.", group: "people" },
  { id: "i4", prompt: "Ask people what they need and summarise what you hear.", group: "people" },
  { id: "i5", prompt: "Build a simple tool that makes a task easier.", group: "build" },
  { id: "i6", prompt: "Test a design and improve it after feedback.", group: "build" },
  { id: "i7", prompt: "Plan who does each task in a group project.", group: "organise" },
  { id: "i8", prompt: "Make a checklist to help a team check its work.", group: "organise" },
] as const;

export const assessmentV1 = {
  version: 1,
  reasoning, habits, confidence, motivation, interests,
  sections: [
    { id: "reasoning", title: "Reasoning", instructions: "Choose the best answer for each situation. Take your time; there is no timer.", questions: reasoning.map(({ id, prompt, options }) => ({ id, prompt, options })) },
    { id: "habits", title: "Study habits", instructions: "Think about the last four weeks. Choose how often you do each action. There are no right or wrong answers.", questions: habits.map(({ id, prompt }) => ({ id, prompt, options: frequency })) },
    { id: "confidence", title: "Confidence and help", instructions: "Think about how you work through hard tasks. Choose what you usually do.", questions: confidence.map(({ id, prompt }) => ({ id, prompt, options: frequency })) },
    { id: "motivation", title: "Motivation and follow-through", instructions: "Think about how you start, continue and review your work.", questions: motivation.map(({ id, prompt }) => ({ id, prompt, options: frequency })) },
    { id: "interests", title: "Career interests", instructions: "Rate how much you would like to try each activity, even if you have never done it before.", questions: interests.map(({ id, prompt }) => ({ id, prompt, options: interest })) },
  ],
};
