import rawCourses from "../data/courses.json";
import { ListCoursesResponse } from "@workspace/api-zod";
import { communityChapters } from "../data/study";

// Some workbooks placed the core allocation in the extended column. Preserve
// those chapter weights for both pathways until an authored extension exists.
const pathways = rawCourses.map(course => {
  const core = course.modules.reduce((sum, m) => sum + m.hours60, 0);
  const extended = course.modules.reduce((sum, m) => sum + m.hours120, 0);
  if (core === 0 && extended === 60) {
    return { ...course, modules: course.modules.map(m => ({ ...m, hours60: m.hours120, hours120: 2 * m.hours120 })) };
  }
  return course;
});
export const courses = ListCoursesResponse.parse(pathways.map(course => course.id !== "01" ? course : {
  ...course,
  modules: course.modules.map((module, index) => {
    const chapter = communityChapters[index];
    if (!chapter) throw new Error("Missing authored chapter for the Community Survey course.");
    return { ...module, content: `${chapter.sections[0]!.body}\n\nThe study book contains the full chapter, practical activity, instructional diagram, animated Adhya-voiced video lesson and adaptive teaching exercise. This is an authored teaching draft awaiting academic review; supervised work and evaluation remain separate.` };
  }),
}));
export const findCourse = (id: string) => courses.find((course) => course.id === id);
