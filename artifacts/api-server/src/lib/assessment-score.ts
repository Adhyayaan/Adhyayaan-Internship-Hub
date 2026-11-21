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
  const reasoning = items("reasoning").map(q => ({
    questionId: q.id, prompt: q.prompt, selected: q.options[values.get(q.id)!]!,
    correctAnswer: q.options[q.correct!]!, correct: values.get(q.id) === q.correct, explanation: q.explanation!,
  }));
  const correct = reasoning.filter(q => q.correct).length;
  function selfRating(key: "habits" | "confidence" | "motivation", title: string): LearningDimension {
    const questions = items(key);
    const points = questions.reduce((sum, item) => {
      const value = values.get(item.id)!;
      return sum + (item.reverse ? 4 - value : value);
    }, 0);
    const score = Math.round(points * 100 / (questions.length * 4));
    return {
      id: key, title, score, maxScore: 100, suggestion: actions[key],
      interpretation: score >= 75 ? "Your answers suggest you use these study actions often."
        : score >= 50 ? "Your answers suggest you use some of these actions. Try to use them more often."
        : "Your answers suggest these actions are useful to practise. Start with one small change.",
    };
  }
  const dimensions: LearningDimension[] = [
    { id: "reasoning", title: "Reasoning in this test", score: correct, maxScore: reasoning.length, suggestion: actions.reasoning,
      interpretation: `You chose the correct answer in ${correct} of ${reasoning.length} short situations. This reflects your answers today, not your IQ.` },
    selfRating("habits", "Study habits"), selfRating("confidence", "Confidence and help"), selfRating("motivation", "Motivation and follow-through"),
  ];
  const strengthNotes: Record<string, string> = {
    reasoning: "You solved most of the reasoning situations in this test.",
    habits: "You report regular use of planning, recall and review habits.",
    confidence: "You report taking steps to get help and work through hard tasks.",
    motivation: "You report making a plan to act on feedback and keep working.",
  };
  const ordered = [...dimensions].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore);
  const strong = dimensions.filter(d => d.score / d.maxScore >= 0.75);
  const developing = ordered.filter(d => d.score / d.maxScore < 0.75);
  const strengths = strong.map(d => strengthNotes[d.id]!);
  if (!strengths.length) {
    const solved = reasoning.find(q => q.correct);
    strengths.push(solved ? `You solved this situation: ${solved.prompt}` : "You have a starting point. Your answers show which skills to practise first.");
  }
  const priorities = developing.length ? developing.slice(0, 3) : ordered.slice(0, 2);
  const careers = (Object.keys(ideas) as Array<keyof typeof ideas>).map(group => ({
    group, score: items("interests").filter(i => i.group === group).reduce((sum, i) => sum + values.get(i.id)!, 0),
  })).sort((a, b) => b.score - a.score);
  // Include ties at the cutoff so equal ratings never imply an invented ranking.
  const top = careers.filter(c => c.score >= careers[1]!.score);
  const habitsScore = dimensions[1]!.score;
  const confidenceScore = dimensions[2]!.score;
  const scenarioNotes = path.sections.some(s => s.id === "choices")
    ? ["sj1", "sj3", "sj5"].flatMap(questionId => {
      const question = items("choices").find(q => q.id === questionId);
      const choice = values.get(questionId);
      if (!question || choice === undefined) return [];
      const note = question.followUpNotes?.[choice];
      return note ? [`${note} This is a reflection, not a score.`] : [];
    }) : [];
  return {
    id, version, completedAt: completedAt.toISOString(), dimensions, reasoning, strengths,
    growthAreas: priorities.map(d => `${d.title}: ${d.suggestion}`),
    nextSteps: [...new Set([...priorities.slice(0, 2).map(d => d.suggestion), "After one week, check which action helped. Keep it or try a different one."])],
    careers: top.map(({ group, score }) => {
      const { interest, ...idea } = ideas[group];
      return { ...idea, reason: score >= 5 ? `You showed interest in ${interest}.` : `This is an option to try if you want to explore ${interest}. Your ratings are not a clear preference yet.` };
    }),
    teachingPlan: [
      correct >= 5 ? "Start with a short example, then ask me to apply it in a new situation." : "Show me one example with clear steps. Check my understanding before adding a harder task.",
      habitsScore < 75 ? "Ask me to recall the main idea without notes. Suggest a short review the next day." : "Ask me to explain my reasoning and compare it with a different method.",
      confidenceScore < 75 ? "Offer one hint at a time. Let me try the next step before giving the full explanation." : "Give me time to try a new question on my own, then offer a hint if I need one.",
      ...scenarioNotes,
    ],
    methodology: "Reasoning: one point for each correct answer. Study habits, confidence and motivation: average of three answers, scaled from 0 to 100. The last-day review item has a reverse score. Scenario choices are not scored as right or wrong; they help guide questions and study suggestions. Interests suggest activities to try, not careers you must choose. This is not an IQ test or a health assessment. "
      + (version === 1 ? "Scores depend on your answers today. If you retake the same version, you may remember the questions."
        : "Your answers guide which follow-up questions you see. Scores describe your answers on this path. Do not use them to compare students or attempts with different questions."),
  };
}
