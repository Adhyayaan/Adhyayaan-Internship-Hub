import rawCourses from "../data/courses.json";
import { ListCoursesResponse } from "@workspace/api-zod";
import { communityChapters } from "../data/study";

export const courses = ListCoursesResponse.parse(rawCourses.map(course => course.id !== "01" ? course : {
  ...course,
  modules: course.modules.map((module, index) => {
    const chapter = communityChapters[index];
    if (!chapter) throw new Error("Missing authored chapter for the Community Survey course.");
    return { ...module, content: `${chapter.sections[0]!.body}\n\nThe study book contains the full chapter, practical activity, instructional diagram, animated Adhya-voiced video lesson and adaptive teaching exercise. This is an authored teaching draft awaiting academic review; supervised work and evaluation remain separate.` };
  }),
}));
export const findCourse = (id: string) => courses.find((course) => course.id === id);
