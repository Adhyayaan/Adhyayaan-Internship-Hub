export type ChapterSource = {
  concept: string; practice: string;
  objectives: string[];
  sections: { heading: string; body: string }[];
  example: string; activity: string;
  steps: { heading: string; body: string }[];
  questions: { understand: string; apply: string; analyze: string };
  sources: string[];
};
