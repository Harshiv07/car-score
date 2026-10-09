import type { ComponentType } from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  ArrowsLeftRight,
  CaretDown,
  CaretLeft,
  Check,
  Heart,
  Moon,
  SlidersHorizontal,
  Sun,
  X,
  type IconProps,
} from "@phosphor-icons/react";

/**
 * Phosphor icons behind one small wrapper, so call sites keep a plain string
 * name and one weight is used everywhere. "heart-fill" is the saved state.
 */
type IconName =
  | "heart"
  | "heart-fill"
  | "compare"
  | "external"
  | "chevron-left"
  | "chevron-down"
  | "refresh"
  | "sun"
  | "moon"
  | "close"
  | "filters"
  | "check";

const GLYPHS: Record<IconName, { glyph: ComponentType<IconProps>; weight?: IconProps["weight"] }> = {
  heart: { glyph: Heart },
  "heart-fill": { glyph: Heart, weight: "fill" },
  compare: { glyph: ArrowsLeftRight },
  external: { glyph: ArrowSquareOut },
  "chevron-left": { glyph: CaretLeft },
  "chevron-down": { glyph: CaretDown },
  refresh: { glyph: ArrowsClockwise },
  sun: { glyph: Sun },
  moon: { glyph: Moon },
  close: { glyph: X },
  filters: { glyph: SlidersHorizontal },
  check: { glyph: Check },
};

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  const { glyph: Glyph, weight = "regular" } = GLYPHS[name];
  return <Glyph size={size} weight={weight} className={className} aria-hidden />;
}
