/**
 * User-facing curriculum vocabulary (Phase 1G decision). The database and API keep their historical names:
 *   DB `lesson`  (course path "lessons", /lessons/:id routes)  →  shown as "Module"
 *   DB `section`                                               →  shown as "Lesson"
 *   DB `activity`                                              →  shown as "Activity"
 * Only presentation strings use these words; identifiers, routes and API fields are unchanged.
 */
export const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm);
export const countLabel = (count: number, singular: string) => `${count} ${plural(count, singular)}`;
