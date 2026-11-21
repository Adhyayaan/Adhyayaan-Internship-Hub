import type { AssessmentChoice, CareerIdea, LearningDimension, LearningReport } from "@workspace/api-zod";
import { assessmentV1 } from "../data/assessment-v1";
import { assessmentPath, assessmentSize } from "./assessment-path";

const ideas: Record<typeof assessmentV1.interests[number]["group"], Omit<CareerIdea, "reason"> & { interest: string }> = {
  data: { title: "Data and research", interest: "checking evidence and finding patterns", skills: ["Spreadsheets", "Charts and tables", "Source checking"], project: "Compare travel times from a public dataset. Explain one pattern and one limit of the data.", counsellorQuestion: "Which entry-level roles use research or spreadsheets in my field?" },
  people: { title: "Education and community work", interest: "explaining ideas and listening to people", skills: ["Clear writing", "Active listening", "Planning a short lesson"], project: "Create a short guide for new students. Ask two volunteers for feedback without recording personal details.", counsellorQuestion: "Where can I try a supervised role that involves teaching or community work?" },
  build: { title: "Design and technology", interest: "making and testing practical tools", skills: ["Prototyping", "Testing", "Writing simple instructions"], project: "Sketch an internship log tool. Test the steps with a classmate and improve one confusing part.", counsellorQuestion: "What small portfolio project would help me explore design or technology?" },
  organise: { title: "Operations and project support", interest: "planning work and helping teams check it", skills: ["Task planning", "Quality checks", "Team communication"], project: "Make a schedule and a checklist for a class event. Note one risk and how the team can handle it.", counsellorQuestion: "Which internships would let me practise organising a project?" },
};

const actions = {
  reasoning: "For one new problem, write what you know, what you do not know, and one reason for your answer.",
  habits: "Study for 20 minutes. Close your notes, explain the main idea, then review it again tomorrow.",
  confidence: "Split one hard task into three parts. Ask one clear question if you get stuck.",
  motivation: "Choose one small goal for this week. Use feedback to decide your next practice task.",
};

export function scoreAssessment(id: string, version: number, completedAt: Date, answers: AssessmentChoice[]): LearningReport | null {
  const path = assessmentPath(version, answers);
  const { questionCount } = assessmentSize(version);
  if (answers.length !== questionCount || path.answers.length !== questionCount) return null;
  const values = new Map(path.answers.map(a => [a.questionId, a.choice]));
  const items = (key: string) => path.sections.find(s => s.id === key)!.questions;
  const reasoningSkills: Record<string, string> = version === 3 ? {
    r1: "Number patterns", r2a: "Addition", r2b: "Number patterns",
    r3a: "Two-step arithmetic", r3b: "Points and subtraction",
    r4a: "Finding a difference", r4b: "Adding and comparing amounts",
    r5a: "Multiplication", r5b: "Adding a group of numbers",
    r6a: "Using a rule", r6b: "Following two rules",
  } : {
    r1: "Checking who a survey includes", r2: "Putting steps in order",
    r3: "Comparing parts of a total", r4: "Checking what caused a result",
    r5: "Reading a table", r6: "Using an idea in a new situation",
  };
  const reasoning = items("reasoning").map(q => ({
    questionId: q.id, prompt: q.prompt, selected: q.options[values.get(q.id)!]!,
    correctAnswer: q.options[q.correct!]!, correct: values.get(q.id) === q.correct, explanation: q.explanation!,
    skill: reasoningSkills[q.id] ?? "Reasoning",
  }));
  const correct = reasoning.filter(q => q.correct).length;
  function selfRating(key: "habits" | "confidence" | "motivation", title: string): LearningDimension {
    const questions = items(key);
    const points = questions.reduce((sum, item) => {
      const value = values.get(item.id)!;
      return sum + (item.reverse ? 4 - value : value);
    }, 0);
    const score = Math.round(points * 100 / (questions.length * 4));
    const evidence = questions.map(item => ({
      prompt: item.prompt,
      response: item.options[values.get(item.id)!]!,
    }));
    return {
      id: key, title, score, maxScore: 100, suggestion: actions[key],
      interpretation: score >= 75 ? "Your answers suggest you use these study actions often."
        : score >= 50 ? "Your answers suggest you use some of these actions. Try to use them more often."
        : "Your answers suggest these actions are useful to practise. Start with one small change.",
      evidence,
    };
  }
  const dimensions: LearningDimension[] = [
    { id: "reasoning", title: "Reasoning in this test", score: correct, maxScore: reasoning.length, suggestion: actions.reasoning,
      interpretation: `You chose the correct answer in ${correct} of ${reasoning.length} short situations. This reflects your answers today, not your IQ.` },
    selfRating("habits", "Study habits"), selfRating("confidence", "Confidence and help"), selfRating("motivation", "Motivation and follow-through"),
  ];
  const ordered = [...dimensions].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore);
  const strong = dimensions.filter(d => d.score / d.maxScore >= 0.75);
  const developing = ordered.filter(d => d.score / d.maxScore < 0.75);
  const strengths = strong.flatMap(d => {
    if (d.id === "reasoning") {
      const examples = reasoning.filter(q => q.correct).slice(0, 2).map(q => q.skill ?? "reasoning");
      return [`Reasoning: You answered ${correct} of ${reasoning.length} questions correctly${examples.length ? `, including ${examples.join(" and ").toLowerCase()}` : ""}.`];
    }
    const evidence = items(d.id).flatMap(question => {
      const choice = values.get(question.id)!;
      const frequency = question.options[choice]!;
      const positiveFrequency = question.reverse ? choice <= 1 : choice >= 3;
      return positiveFrequency ? [`“${frequency}” for “${question.prompt}”`] : [];
    }).slice(0, 2);
    return [evidence.length
      ? `${d.title}: You reported ${evidence.join(" and ")}.`
      : `${d.title}: ${d.interpretation}`];
  });
  if (!strengths.length) {
    const solved = reasoning.find(q => q.correct);
    strengths.push(solved
      ? `You answered one reasoning question correctly, on ${solved.skill?.toLowerCase() ?? "a reasoning question"}.`
      : "You have a starting point. The explanations below show what you can practise next.");
  }
  const priorities = developing.length ? developing.slice(0, 3) : ordered.slice(0, 2);
  const growthAreas = priorities.map(d => {
    if (d.id === "reasoning") {
      const missed = reasoning.filter(q => !q.correct).slice(0, 2).map(q => q.skill?.toLowerCase() ?? "reasoning");
      return missed.length
        ? `Reasoning: Review ${missed.join(" and ")} in the explanations below. ${d.suggestion}`
        : `Reasoning: ${d.suggestion}`;
    }
    const weakest = items(d.id).map(question => {
      const choice = values.get(question.id)!;
      const value = question.reverse ? 4 - choice : choice;
      return { question, choice, value };
    }).sort((a, b) => a.value - b.value)[0];
    const detail = weakest
      ? `Your answer was “${weakest.question.options[weakest.choice]}” for “${weakest.question.prompt}”`
      : "";
    return `${d.title}: ${detail ? `${detail}. ` : ""}${d.suggestion}`;
  });
  const careers = (Object.keys(ideas) as Array<keyof typeof ideas>).map(group => ({
    group, score: items("interests").filter(i => i.group === group).reduce((sum, i) => sum + values.get(i.id)!, 0),
  })).sort((a, b) => b.score - a.score);
  const habitsScore = dimensions[1]!.score;
  const confidenceScore = dimensions[2]!.score;
  const scenarioInsights = path.sections.some(s => s.id === "choices")
    ? ["sj1", "sj3", "sj5"].flatMap(questionId => {
      const question = items("choices").find(q => q.id === questionId);
      const choice = values.get(questionId);
      if (!question || choice === undefined) return [];
      const note = question.followUpNotes?.[choice];
      return note ? [`${note} This is a reflection, not a score.`] : [];
    }) : [];
  return {
    id, version, completedAt: completedAt.toISOString(), dimensions, reasoning, strengths,
    growthAreas,
    nextSteps: [...new Set([...growthAreas.slice(0, 2), "Try one step this week. Then note whether it helped."])],
    careers: careers.map(({ group, score }) => {
      const { interest, ...idea } = ideas[group];
      return { ...idea, reason: score >= 5 ? `You showed interest in ${interest}.` : `This is an option to try if you want to explore ${interest}. Your ratings are not a clear preference yet.`,
        interestScore: score, interestMax: items("interests").filter(i => i.group === group).length * 4 };
    }),
    teachingPlan: [
      correct >= 5 ? "Start with a short example, then ask me to apply it in a new situation." : "Show me one example with clear steps. Check my understanding before adding a harder task.",
      habitsScore < 75 ? "Ask me to recall the main idea without notes. Suggest a short review the next day." : "Ask me to explain my reasoning and compare it with a different method.",
      confidenceScore < 75 ? "Offer one hint at a time. Let me try the next step before giving the full explanation." : "Give me time to try a new question on my own, then offer a hint if I need one.",
    ],
    scenarioInsights,
    methodology: "Reasoning: one point for each correct answer. Study habits, confidence and motivation: average of three answers, scaled from 0 to 100. The last-day review item has a reverse score. Each interest rating adds two activity answers, for a range from 0 to 8. Scenario choices are not scored as right or wrong; they help guide questions and study suggestions. Interests suggest activities to try, not careers you must choose. This is not an IQ test or a health assessment. "
      + (version === 1 ? "Scores depend on your answers today. If you retake the same version, you may remember the questions."
        : `Your answers guide which follow-up questions you see. Scores describe your answers on this path. Do not use them to compare students or attempts with different questions. Your reasoning result is based on ${reasoning.length} questions. The study scores come from three answers each and reflect what you reported, not an observed test of your behavior.`),
  };
}
