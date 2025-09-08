// Segmented prompt builder for adaptive instructions based on toggles

function humanNounWithArticle(gender: string): string {
  const g = gender.toLowerCase();
  return g === "homme" ? "d’un homme réaliste" : "d’une femme réaliste";
}

export function corpulenceFromSize(size: string): string {
  const s = size.toLowerCase();
  switch (s) {
    case "xxs":
      return "gabarit très fin/petit, carrure étroite";
    case "xs":
      return "gabarit fin/petit, carrure étroite";
    case "s":
      return "silhouette plutôt mince, carrure légère";
    case "m":
      return "silhouette moyenne/standard, carrure normale";
    case "l":
      return "silhouette plus large, carrure marquée";
    case "xl":
      return "silhouette forte, carrure large";
    case "xxl":
      return "silhouette très forte, grande carrure";
    default:
      return "silhouette moyenne/standard, carrure normale";
  }
}

export function segmentSize(size: string): string {
  const corp = corpulenceFromSize(size);
  const up = size.toUpperCase();
  return `Taille du vêtement: ${up}, ajustement réaliste (ni trop serré ni flottant), plis naturels du tissu. Corpulence: ${corp}.`;
}

export function segmentPose(pose: string): string {
  const p = pose.toLowerCase();
  switch (p) {
    case "trois-quarts":
      return "Pose: debout à 45° (trois-quarts), buste légèrement tourné; attitude naturelle.";
    case "profil":
      return "Pose: vu de profil, silhouette latérale bien détachée; attitude naturelle.";
    case "assis":
      return "Pose: assis de manière décontractée (chaise/canapé), dos droit, vêtement bien visible.";
    case "marche":
      return "Pose: en marche naturelle, une jambe avancée, mouvement doux.";
    case "face":
    default:
      return "Pose: debout face à l'appareil, posture droite, regard vers l'objectif; attitude naturelle.";
  }
}

export function segmentBackground(background: string): string {
  const b = background.toLowerCase();
  switch (b) {
    case "chambre":
      return "Environnement: chambre lumineuse rangée (lit/armoire discrets), tons clairs; arrière-plan présent mais discret.";
    case "salon":
      return "Environnement: salon convivial (canapé/déco discrets); arrière-plan sobre et légèrement flou.";
    case "extérieur":
      return "Environnement: extérieur urbain ou parc; arrière-plan doux et flou pour garder le focus sur le vêtement.";
    case "studio":
    default:
      return "Environnement: studio sur fond uni blanc/gris clair; décor minimal pour valoriser le vêtement.";
  }
}

export function segmentStyle(style: string, background: string): string {
  const s = style.toLowerCase();
  const b = background.toLowerCase();
  if (s === "amateur") {
    switch (b) {
      case "chambre":
        return "Style: cliché smartphone authentique comme posté sur Vinted. Éclairage: lumière naturelle d'une fenêtre, exposition équilibrée, couleurs neutres.";
      case "salon":
        return "Style: cliché smartphone authentique. Éclairage: lumière de fin d'après-midi, tonalité chaude légère, décor discret.";
      case "extérieur":
        return "Style: cliché smartphone authentique. Éclairage: plein jour, soleil latéral doux, ombres portées crédibles, arrière-plan légèrement flou.";
      case "studio":
      default:
        return "Style: cliché amateur simple sur fond uni, lumière diffuse uniforme, exposition correcte.";
    }
  } else {
    // professionnel
    switch (b) {
      case "chambre":
        return "Style: prise de vue professionnelle, netteté propre. Éclairage: diffus soigné (fenêtre + appoint doux), ombres contrôlées.";
      case "salon":
        return "Style: prise de vue professionnelle. Éclairage: diffusion homogène, reflets doux sur le tissu, ombres propres.";
      case "extérieur":
        return "Style: prise de vue pro en extérieur. Éclairage: lumière naturelle adoucie (nuages légers), ombres au sol douces.";
      case "studio":
      default:
        return "Style: prise de vue professionnelle e‑commerce. Éclairage: softbox frontal + latéral, fond uni blanc/gris clair, ombres très douces.";
    }
  }
}

export function segmentVinted(): string {
  return (
    "Conforme au marché Vinted: rendu sobre et vendeur, sans logos ni texte ajouté, sans watermark, ni éléments parasites; " +
    "une seule personne, pas d'accessoires non inclus."
  );
}

export function segmentPhotoTech(): string {
  return (
    "Cadrage: ratio 4:5, orientation portrait; vêtement bien centré. " +
    "Qualité: image nette, haute définition, balance des blancs neutre, contraste modéré. " +
    "Fidélité: couleurs/matières/motifs/coutures préservés; perspective et proportions crédibles; mains/visage corrects. " +
    "Plan: en pied si possible, sinon plan américain selon l'article. " +
    "Accent: texture du tissu et détails (motifs, boutons, coutures) bien visibles."
  );
}

function articleJeune(gender: string): string {
  return gender.toLowerCase() === "homme" ? "un jeune homme" : "une jeune femme";
}

export function segmentAmateurScene(background: string, gender: string): string {
  const subj = articleJeune(gender);
  const b = background.toLowerCase();
  switch (b) {
    case "chambre":
      return (
        `${subj} se tenant devant un miroir dans une chambre à coucher, ` +
        `prenant un selfie avec son téléphone portable "iPhone 15 noir". ` +
        `L'arrière-plan montre un lit en bois avec des draps clairs, ` +
        `une table en bois avec des livres et quelques vêtements éparpillés ` +
        `sur le sol en bois.`
      );
    case "salon":
      return (
        `${subj} dans un salon, smartphone à la main, ` +
        `avec un canapé en tissu et une table basse visibles en arrière-plan; ` +
        `quelques objets du quotidien discrets (livres, coussins), décor rangé.`
      );
    case "extérieur":
      return (
        `${subj} en extérieur, photo smartphone en cadrage vertical, ` +
        `dans une rue ou un parc; arrière-plan urbain/verdure légèrement flou.`
      );
    case "studio":
    default:
      return (
        `${subj} sur fond uni simple, pris au smartphone; ` +
        `mise en scène minimale, éclairage diffus.`
      );
  }
}

export function composePromptSegments(
  args: { gender: string; size: string; pose: string; background: string; style: string },
  productReference?: string,
  variantLabel?: string
): string {
  const start = `Utilise la photo fournie et génère une image photoréaliste ${humanNounWithArticle(args.gender)} portant ce vêtement.`;
  const ref = productReference ? ` Référence produit: ${productReference}.` : "";
  const variant = variantLabel ? ` Variante: ${variantLabel}.` : "";
  const size = segmentSize(args.size);
  const pose = segmentPose(args.pose);
  const env = segmentBackground(args.background);
  const style = segmentStyle(args.style, args.background);
  const amateurScene = args.style === "amateur" ? segmentAmateurScene(args.background, args.gender) : "";
  const vinted = segmentVinted();
  const photo = segmentPhotoTech();
  return [start + ref + variant, size, pose, env, style, amateurScene, vinted, photo]
    .map((s) => s.trim())
    .join(" ")
    .trim();
}
