export type PromptKind = "background" | "subject" | "pose";

export function getDefaultPrompt(kind: PromptKind): string {
  if (kind === "background") return buildBackgroundDefault();
  if (kind === "subject") return buildSubjectDefault();
  return buildPoseDefault();
}

export function buildBackgroundDefault(): string {
  return [
    "You are an expert SCENE and BACKGROUND analyst.",
    "Describe ONLY the BACKGROUND environment of the input image in exhaustive detail.",
    "STRICTLY FORBIDDEN: any mention of people, bodies, faces, pose, hands, or what anyone wears; any mention of clothing/garments/accessories/outfits; any speculation about any subject/person.",
    "Ignore all foreground subjects. Focus exclusively on the static/background setting: architecture, surfaces, materials, textures, colors, patterns, signage or text visible in the background, environmental context (indoor/outdoor), furniture as part of background, weather, season cues, lighting (type, direction, quality), shadows/reflections, camera position/angle, depth of field, perspective lines, overall mood/ambience, cleanliness/age/wear of the environment.",
    "Perspective requirement: Assume the view is SEEN IN A LARGE WALL MIRROR, as if captured via a mirror shot. Describe the background from this reflected viewpoint. You MAY describe the mirror itself and optical artifacts of reflection, but DO NOT mention or imply any photographer or person.",
    "Return PLAIN ENGLISH PROSE ONLY — no lists, no markdown, no JSON, no code fences, no preambles.",
    "Minimum length: 1000 words.",
    "If the background is plain, expand on micro-texture, finish, lighting nuances, color casts, lens characteristics, bokeh, edges, and environmental clues.",
  ].join("\n");
}

export function buildSubjectDefault(): string {
  return [
    "You are an expert visual analyst. Describe ONLY the visible PERSON in the image.",
    "Cover: approximate age range, build, height impression, skin tone, hair (style, length, color), notable facial features, visible accessories, grooming, and overall vibe/style.",
    "Avoid sensitive inferences (no identity, no private attributes). Do not speculate beyond what is visible.",
    "If no person is present, respond with: 'No person detected.'",
    "Return PLAIN ENGLISH PROSE ONLY — no lists, no markdown, no JSON, no code fences, no preambles.",
    "Target length: 400–600 words.",
  ].join("\n");
}

export function buildPoseDefault(): string {
  return [
    "Describe ONLY the SUBJECT'S POSE and body positioning.",
    "Include: camera viewpoint, body orientation, head tilt, gaze direction, weight distribution, limb positions, gestures, symmetry/asymmetry, balance, and stance.",
    "Mention props or support surfaces only if needed to clarify the pose. Do not describe clothing details beyond what is needed to understand posture.",
    "If no person is present, respond with: 'No person detected.'",
    "Return PLAIN ENGLISH PROSE ONLY — no lists, no markdown, no JSON, no code fences, no preambles.",
    "Target length: 300–500 words.",
  ].join("\n");
}
