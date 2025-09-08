export type MannequinOptions = {
  gender?: string; // "femme" | "homme"
  subject?: string; // "humain" | "mannequin"
  size?: string; // "xxs" | "xs" | "s" | "m" | "l" | "xl" | "xxl"
  pose?: string; // ex: "face", "trois-quarts", "assis", "marche", "profil"
  background?: string; // "chambre" | "salon" | "studio" | "extérieur"
  style?: string; // "professionnel" | "amateur"
};

export function normalizeOptions(
  opts?: MannequinOptions
): Required<Pick<MannequinOptions, "gender" | "subject" | "size" | "pose" | "background" | "style">> {
  const o = opts || {};
  const gender = (o.gender || "femme").toLowerCase();
  const subject = (o.subject || "humain").toLowerCase();
  const size = (o.size || "m").toLowerCase();
  const pose = (o.pose || "face").toLowerCase();
  const background = (o.background || "studio").toLowerCase();
  const style = (o.style || "professionnel").toLowerCase();
  return { gender, subject, size, pose, background, style };
}
import { composePromptSegments } from "./promptSegments";

export function buildInstruction(
  inputOpts: MannequinOptions,
  productReference?: string,
  variantLabel?: string
): string {
  const { gender, subject, size, pose, background, style } = normalizeOptions(inputOpts);
  return composePromptSegments({ gender, subject, size, pose, background, style }, productReference, variantLabel);
}
