export type Pose = "face" | "trois-quarts" | "profil";

export type MannequinOptions = {
  gender?: string; // "femme" | "homme"
  size?: string; // "xxs" | "xs" | "s" | "m" | "l" | "xl" | "xxl"
  pose?: string; // legacy single pose; kept for backward compatibility
  poses?: Pose[]; // new: allow selecting multiple poses
  background?: string; // "chambre" | "salon" | "studio" | "extérieur"
  style?: string; // "professionnel" | "amateur"
};

export function normalizeOptions(
  opts?: MannequinOptions
): Required<Pick<MannequinOptions, "gender" | "size" | "pose" | "background" | "style">> {
  const o = opts || {};
  const gender = (o.gender || "femme").toLowerCase();
  const size = (o.size || "xs").toLowerCase();
  const pose = (o.pose || "face").toLowerCase();
  const background = (o.background || "chambre").toLowerCase();
  const style = (o.style || "amateur").toLowerCase();
  return { gender, size, pose, background, style };
}
import { composePromptSegments, composePromptWithProvidedBackground } from "./promptSegments";

export function buildInstruction(
  inputOpts: MannequinOptions,
  productReference?: string,
  variantLabel?: string
): string {
  const { gender, size, pose, background, style } = normalizeOptions(inputOpts);
  return composePromptSegments({ gender, size, pose, background, style }, productReference, variantLabel);
}

/**
 * Build instruction for a specific pose override, using other options as-is.
 */
export function buildInstructionForPose(
  inputOpts: MannequinOptions,
  pose: Pose,
  productReference?: string,
  variantLabel?: string
): string {
  const base = normalizeOptions(inputOpts);
  return composePromptSegments(
    { gender: base.gender, size: base.size, pose, background: base.background, style: base.style },
    productReference,
    variantLabel
  );
}

/**
 * Build instruction when an environment image is provided: omit background description.
 */
export function buildInstructionForPoseWithProvidedBackground(
  inputOpts: MannequinOptions,
  pose: Pose,
  productReference?: string,
  variantLabel?: string
): string {
  const base = normalizeOptions(inputOpts);
  return composePromptWithProvidedBackground(
    { gender: base.gender, size: base.size, pose, style: base.style },
    productReference,
    variantLabel
  );
}
