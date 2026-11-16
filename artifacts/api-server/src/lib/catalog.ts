import rawCourses from "../data/courses.json";
import { ListCoursesResponse } from "@workspace/api-zod";

export const courses = ListCoursesResponse.parse(rawCourses);
export const findCourse = (id: string) => courses.find((course) => course.id === id);
