export type MannequinOptions = {
  gender?: string; // "femme" | "homme"
  size?: string; // "xxs" | "xs" | "s" | "m" | "l" | "xl" | "xxl"
  pose?: string; // ex: "face", "trois-quarts", "assis", "marche", "profil"
  background?: string; // "chambre" | "salon" | "studio" | "extérieur"
  style?: string; // "professionnel" | "amateur"
};

export function normalizeOptions(
  opts?: MannequinOptions
): Required<Pick<MannequinOptions, "gender" | "size" | "pose" | "background" | "style">> {
  const o = opts || {};
  const gender = (o.gender || "femme").toLowerCase();
  const size = (o.size || "m").toLowerCase();
  const pose = (o.pose || "face").toLowerCase();
  const background = (o.background || "studio").toLowerCase();
  const style = (o.style || "professionnel").toLowerCase();
  return { gender, size, pose, background, style };
}

function styleSentence(style: string): string {
  switch (style) {
    case "amateur":
      return "Style: prise de vue amateur smartphone (lumière naturelle, rendu spontané).";
    case "professionnel":
    default:
      return "Style: prise de vue professionnelle (netteté propre, éclairage maîtrisé).";
  }
}

function corpulenceFromSize(size: string): string {
  const s = size.toLowerCase();
  switch (s) {
    case "xxs":
      return "corpulence très fine, petit gabarit";
    case "xs":
      return "corpulence fine, petit gabarit";
    case "s":
      return "corpulence plutôt mince";
    case "m":
      return "corpulence moyenne/standard";
    case "l":
      return "corpulence plus large, carrure marquée";
    case "xl":
      return "corpulence forte, carrure large";
    case "xxl":
      return "corpulence très forte, grande carrure";
    default:
      return "corpulence moyenne/standard";
  }
}

export function buildInstruction(
  inputOpts: MannequinOptions,
  productReference?: string,
  variantLabel?: string
): string {
  const { gender, size, pose, background, style } = normalizeOptions(inputOpts);

  const refText = productReference ? `Référence produit: ${productReference}. ` : "";
  const variant = variantLabel ? `Variante: ${variantLabel}. ` : "";

  const vintedGuidelines =
    "Conforme au marché Vinted: rendu sobre et vendeur, sans logos ni texte ajouté, sans watermark, ni éléments parasites; une seule personne, pas d'accessoires non inclus; ratio 4:5, orientation verticale, prêt pour miniatures Vinted.";
  const realism =
    "Mannequin humain réaliste (proportions crédibles, peau naturelle, pas de look cartoon), pose naturelle, regard neutre ou légèrement hors caméra.";

  const styleText = styleSentence(style);
  const corpulenceText = `Gabarit du mannequin: taille ${size.toUpperCase()}, ${corpulenceFromSize(size)}.`;

  const base =
    `${refText}${variant}` +
    `Transforme la photo du vêtement non porté en une photo portée très réaliste.` +
    ` Garde la fidélité des couleurs, matières, motifs et coutures.` +
    ` Présente le vêtement sur un mannequin/humain (${gender}). ` +
    `${corpulenceText} ` +
    `Pose: ${pose}. Environnement: ${background}. ` +
    `${styleText} ` +
    `${realism} ` +
    `${vintedGuidelines} ` +
    ` Définition haute, netteté propre, balance des blancs neutre, rendu naturel, sans texte ni watermark.`;

  return base.trim();
}
