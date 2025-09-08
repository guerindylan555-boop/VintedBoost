export type MannequinOptions = {
  gender?: string; // "femme", "homme", "unisex", "enfant"
  morphology?: string; // ex: "XS", "S", "M", "L", "XL", "athletic", "petite", "standard"
  pose?: string; // ex: "face", "trois-quarts", "assis", "marche", "profil"
  background?: string; // ex: "fond blanc studio", "gris neutre", "béton", "mur brique", "extérieur urbain"
  style?: string; // ex: "studio e-commerce", "éditorial", "lifestyle intérieur", "streetwear", "extérieur jour"
  customText?: string; // texte libre additionnel
};

export function normalizeOptions(opts?: MannequinOptions): Required<Pick<MannequinOptions, "gender"|"morphology"|"pose"|"background"|"style">> & Partial<MannequinOptions> {
  const o = opts || {};
  const gender = (o.gender || "unisex").toLowerCase();
  const morphology = (o.morphology || "standard").toLowerCase();
  const pose = (o.pose || "face").toLowerCase();
  const background = (o.background || "fond blanc studio").toLowerCase();
  const style = (o.style || "studio e-commerce").toLowerCase();
  return { gender, morphology, pose, background, style, customText: o.customText };
}

function styleSentence(style: string): string {
  switch (style) {
    case "éditorial":
      return "Style: éditorial propre, cadrage simple, adapté aux annonces Vinted.";
    case "lifestyle intérieur":
      return "Style: lifestyle intérieur, ambiance naturelle, adapté Vinted.";
    case "streetwear":
      return "Style: streetwear simple, focus vêtement, adapté Vinted.";
    case "extérieur jour":
      return "Style: extérieur jour lumineux, rendu naturel, adapté Vinted.";
    case "studio e-commerce":
    default:
      return "Style: studio e-commerce, éclairage doux diffus (type softbox), 50mm équivalent.";
  }
}

export function buildInstruction(
  inputOpts: MannequinOptions,
  productReference?: string,
  variantLabel?: string
): string {
  const { gender, morphology, pose, background, style, customText } = normalizeOptions(inputOpts);

  const refText = productReference ? `Référence produit: ${productReference}. ` : "";
  const variant = variantLabel ? `Variante: ${variantLabel}. ` : "";

  const vintedGuidelines =
    "Conforme au marché Vinted: rendu sobre et vendeur, sans logos ni texte ajouté, sans watermark, ni éléments parasites; une seule personne, pas d'accessoires non inclus; ratio 4:5, orientation verticale, prêt pour miniatures Vinted.";
  const realism =
    "Mannequin humain réaliste (proportions crédibles, peau naturelle, pas de look cartoon), pose naturelle, regard neutre ou légèrement hors caméra.";

  const styleText = styleSentence(style);

  const base =
    `${refText}${variant}` +
    `Transforme la photo du vêtement non porté en une photo portée très réaliste.` +
    ` Garde la fidélité des couleurs, matières, motifs et coutures.` +
    ` Présente le vêtement sur un mannequin/humain (${gender}, morphologie ${morphology}),` +
    ` en pose ${pose}, fond/environnement ${background}. ` +
    `${styleText} ` +
    `${realism} ` +
    `${vintedGuidelines} ` +
    ` Définition haute, netteté propre, balance des blancs neutre, rendu naturel, sans texte ni watermark.`;

  const extra = customText ? ` ${customText.trim()}` : "";
  return (base + extra).trim();
}

