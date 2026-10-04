/**
 * Body styles, kept free of three.js so the main bundle can choose a
 * silhouette without pulling the 3D engine in with it.
 */
export type BodyStyle = "sedan" | "suv";

/** Map an inventory body label ("Compact SUV", "Sedan") to a silhouette. */
export function bodyStyleFor(label: string | null | undefined): BodyStyle {
  return label && /suv|crossover|truck|wagon/i.test(label) ? "suv" : "sedan";
}
