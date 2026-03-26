#!/usr/bin/env node

/**
 * Content Distribution MCP Server
 *
 * 7 tools for AI agents to distribute content across social platforms:
 * 1. draft_post           — Generate a post for a specific platform
 * 2. repurpose_content    — Adapt content from one platform to another
 * 3. generate_carousel    — Generate carousel slides (LinkedIn/Instagram)
 * 4. schedule_content     — Save content to a publishing queue
 * 5. get_content_calendar — View the content calendar/queue
 * 6. analyze_post_performance — Predict engagement and get suggestions
 * 7. generate_thread      — Generate a multi-post thread (X/LinkedIn)
 *
 * Resources:
 * - content-queue: Current content queue
 *
 * Prompts:
 * - weekly_content_sprint: Generate a week of content (5 posts across platforms)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Configuration ──────────────────────────────────────────────

const CONTENT_DIR =
  process.env.CONTENT_DIR ||
  "D:\\Neo business\\stresszero-entrepreneur\\content-os";

const QUEUE_FILE = path.join(CONTENT_DIR, "content-queue.json");

// ─── StressZero Brand Rules ─────────────────────────────────────

const BRAND = {
  identity: "Emmanuel Gomes Soares, Coach specialise burnout entrepreneur",
  site: "stresszeroentrepreneur.fr",
  urls: {
    home: "stresszeroentrepreneur.fr",
    test: "stresszeroentrepreneur.fr/test-burnout",
    guide: "stresszeroentrepreneur.fr/guide-7-jours",
  },
  tone_rules: [
    "Tutoiement (pas vouvoiement)",
    "Max 3 emojis par post",
    "3-5 hashtags max",
    "Phrases courtes, 1 idee par phrase",
    "Empathique, concret, pas de jargon medical",
  ],
  hashtags: {
    core: ["#burnout", "#entrepreneur", "#stresszero"],
    secondary: ["#bienetre", "#sante", "#santemental", "#leadership", "#mindset", "#equilibre", "#developpementpersonnel"],
  },
  cta: {
    soft: [
      "Et toi, tu en es ou ?",
      "Ca te parle ?",
      "Dis-moi en commentaire",
      "Tu te reconnais ?",
    ],
    medium: [
      "Decouvre notre test burnout gratuit (2 min) : stresszeroentrepreneur.fr/test-burnout",
      "Telecharge le guide gratuit : stresszeroentrepreneur.fr/guide-7-jours",
      "Lien dans le premier commentaire",
    ],
    hard: [
      "Prends RDV maintenant : stresszeroentrepreneur.fr",
      "Reserve ta seance decouverte (90 min) : stresszeroentrepreneur.fr",
      "Ecris-moi en DM, je t'aide.",
    ],
  },
} as const;

// ─── Platform limits ────────────────────────────────────────────

const PLATFORM_LIMITS: Record<string, { maxChars: number; maxHashtags: number; format: string }> = {
  linkedin: { maxChars: 3000, maxHashtags: 5, format: "Paragraphes courts, sauts de ligne, emojis moderes" },
  instagram: { maxChars: 2200, maxHashtags: 30, format: "Caption engageante, hashtags en fin de post" },
  x: { maxChars: 280, maxHashtags: 3, format: "Concis, percutant, 1 idee max" },
  tiktok: { maxChars: 2200, maxHashtags: 5, format: "Accroche video, decontracte, conversationnel" },
};

// ─── Post format templates ──────────────────────────────────────

type PostFormat = "hook_story" | "stat_choc" | "question" | "framework" | "temoignage" | "mythe_realite" | "behind_scenes";
type ToneType = "empathique" | "direct" | "inspirant";
type CtaType = "soft" | "medium" | "hard";
type PlatformType = "linkedin" | "instagram" | "x" | "tiktok";

interface PostTemplate {
  structure: string[];
  example_hook: string;
}

const POST_TEMPLATES: Record<PostFormat, PostTemplate> = {
  hook_story: {
    structure: [
      "[HOOK — phrase choc ou situation vecu]",
      "",
      "[CONTEXTE — plante le decor en 2-3 phrases]",
      "",
      "[CONFLIT — le probleme, la douleur]",
      "",
      "[TOURNANT — ce qui a change]",
      "",
      "[LECON — l'insight actionnable]",
      "",
      "[CTA]",
    ],
    example_hook: "Il y a 2 ans, je me suis effondre en pleine reunion.",
  },
  stat_choc: {
    structure: [
      "[STAT CHOC — chiffre surprenant]",
      "",
      "[EXPLICATION — pourquoi c'est grave]",
      "",
      "[IMPACT — ce que ca veut dire pour toi]",
      "",
      "[SOLUTION — 1 action concrete]",
      "",
      "[CTA]",
    ],
    example_hook: "1 entrepreneur sur 3 est en burnout. Et la plupart ne le savent pas.",
  },
  question: {
    structure: [
      "[QUESTION PROVOCANTE]",
      "",
      "[DEVELOPPEMENT — pourquoi cette question compte]",
      "",
      "[PERSPECTIVE INATTENDUE]",
      "",
      "[CONCLUSION + CTA]",
    ],
    example_hook: "Et si ton burnout n'etait pas un signe de faiblesse, mais d'ambition mal canalisee ?",
  },
  framework: {
    structure: [
      "[PROMESSE — resultat en X etapes]",
      "",
      "[ETAPE 1 — titre + 1 phrase]",
      "[ETAPE 2 — titre + 1 phrase]",
      "[ETAPE 3 — titre + 1 phrase]",
      "",
      "[POURQUOI CA MARCHE]",
      "",
      "[CTA]",
    ],
    example_hook: "Ma methode en 3 etapes pour sortir du burnout sans tout arreter :",
  },
  temoignage: {
    structure: [
      "[AVANT — la situation de depart]",
      "",
      "[DECLENCHEUR — le moment de bascule]",
      "",
      "[PARCOURS — ce qui a ete fait]",
      "",
      "[APRES — les resultats concrets]",
      "",
      "[MESSAGE — ce que ca peut t'apporter aussi]",
      "",
      "[CTA]",
    ],
    example_hook: "\"J'avais perdu 8 kg, je ne dormais plus, et je pensais que c'etait normal.\"",
  },
  mythe_realite: {
    structure: [
      "[MYTHE — la croyance populaire]",
      "",
      "[REALITE — la verite contre-intuitive]",
      "",
      "[PREUVE — argument ou experience]",
      "",
      "[CE QUE TU PEUX FAIRE — action concrete]",
      "",
      "[CTA]",
    ],
    example_hook: "\"Le burnout, c'est pour les faibles.\" FAUX.",
  },
  behind_scenes: {
    structure: [
      "[CONTEXTE — ce que je fais en coulisses]",
      "",
      "[CHALLENGE — la difficulte du moment]",
      "",
      "[LECON — ce que j'en tire]",
      "",
      "[TRANSPARENCE — un chiffre ou fait brut]",
      "",
      "[CTA]",
    ],
    example_hook: "Aujourd'hui je te montre les coulisses de mon activite de coach.",
  },
};

// ─── Content generation helpers ─────────────────────────────────

function selectHashtags(platform: PlatformType, count: number): string[] {
  const limit = Math.min(count, PLATFORM_LIMITS[platform]?.maxHashtags || 5);
  // Always include core hashtags, fill rest from secondary
  const selected: string[] = [...BRAND.hashtags.core];
  const remaining: string[] = [...BRAND.hashtags.secondary];
  while (selected.length < limit && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    selected.push(remaining.splice(idx, 1)[0]);
  }
  return selected.slice(0, limit);
}

function selectCta(ctaType: CtaType): string {
  const options = BRAND.cta[ctaType];
  return options[Math.floor(Math.random() * options.length)];
}

function generatePost(
  topic: string,
  platform: PlatformType,
  format: PostFormat,
  tone: ToneType,
  ctaType: CtaType,
): string {
  const template = POST_TEMPLATES[format];
  const limits = PLATFORM_LIMITS[platform];
  const hashtags = selectHashtags(platform, platform === "instagram" ? 5 : 3);
  const cta = selectCta(ctaType);

  const toneInstructions: Record<ToneType, string> = {
    empathique: "Ton chaleureux et bienveillant, tu comprends la douleur",
    direct: "Ton franc et sans detour, tu vas droit au but",
    inspirant: "Ton motivant et energisant, tu donnes envie d'agir",
  };

  const lines: string[] = [
    `--- POST ${platform.toUpperCase()} ---`,
    `Sujet: ${topic}`,
    `Format: ${format}`,
    `Ton: ${tone} — ${toneInstructions[tone]}`,
    `Plateforme: ${platform} (max ${limits.maxChars} caracteres)`,
    `Format plateforme: ${limits.format}`,
    "",
    "=== STRUCTURE ===",
    "",
    ...template.structure,
    "",
    "=== ELEMENTS ===",
    "",
    `Hook d'exemple: ${template.example_hook}`,
    `CTA: ${cta}`,
    `Hashtags: ${hashtags.join(" ")}`,
    "",
    "=== REGLES STRESSZERO ===",
    "",
    ...BRAND.tone_rules.map((r) => `- ${r}`),
    `- Identite: ${BRAND.identity}`,
    `- Site: ${BRAND.site}`,
    "",
    "=== POST GENERE ===",
    "",
  ];

  // Generate actual post content based on format and topic
  const post = buildPostContent(topic, format, tone, cta, hashtags, platform);
  lines.push(post);
  lines.push("");
  lines.push(`--- Caracteres: ${post.length}/${limits.maxChars} ---`);

  if (post.length > limits.maxChars) {
    lines.push(`ATTENTION: Le post depasse la limite de ${limits.maxChars} caracteres. Raccourcir.`);
  }

  return lines.join("\n");
}

function buildPostContent(
  topic: string,
  format: PostFormat,
  tone: ToneType,
  cta: string,
  hashtags: string[],
  platform: PlatformType,
): string {
  const tonePrefix: Record<ToneType, string> = {
    empathique: "Je sais ce que tu traverses.",
    direct: "Parlons franchement.",
    inspirant: "Tu as le pouvoir de changer ca.",
  };

  const hookMap: Record<PostFormat, string> = {
    hook_story: `J'ai accompagne un entrepreneur qui vivait exactement ca : ${topic}.`,
    stat_choc: `Le savais-tu ? Le ${topic} touche 1 entrepreneur sur 3 en France.`,
    question: `Et si le ${topic} etait le signe que tu ignores depuis trop longtemps ?`,
    framework: `Ma methode en 3 etapes pour gerer ${topic} sans tout arreter :`,
    temoignage: `"Je pensais que ${topic} faisait partie du jeu. J'avais tort."`,
    mythe_realite: `"${topic}, c'est normal quand on est entrepreneur." FAUX.`,
    behind_scenes: `Aujourd'hui, je te partage ce que j'ai appris sur ${topic} en coulisses.`,
  };

  const bodyMap: Record<PostFormat, string> = {
    hook_story: [
      "",
      `${tonePrefix[tone]}`,
      "",
      `${topic} — c'est un sujet dont on ne parle pas assez.`,
      "",
      "Beaucoup d'entrepreneurs vivent ca en silence.",
      "Ils pensent que c'est le prix a payer.",
      "",
      "Mais non.",
      "",
      "La verite, c'est qu'il existe des solutions concretes.",
      "Et la premiere etape, c'est d'en prendre conscience.",
    ].join("\n"),
    stat_choc: [
      "",
      "Ce chiffre devrait t'interpeller.",
      "",
      `Parce que ${topic} ne se resout pas tout seul.`,
      "Plus tu attends, plus c'est difficile.",
      "",
      "La bonne nouvelle ?",
      "Tu peux agir des aujourd'hui.",
      "En 2 minutes, tu peux savoir ou tu en es.",
    ].join("\n"),
    question: [
      "",
      "Cette question, je me la suis posee aussi.",
      "",
      `${topic} est souvent mal compris.`,
      "",
      "On pense que c'est une fatalite.",
      "En realite, c'est un signal.",
      "Un signal que quelque chose doit changer.",
    ].join("\n"),
    framework: [
      "",
      `1. Identifie les signaux — ${topic} a des symptomes clairs`,
      `2. Mets en place 1 routine protectrice — ca prend 10 min/jour`,
      `3. Demande de l'aide — tu n'as pas a tout porter seul`,
      "",
      "Ca marche parce que c'est simple, concret, et adapte a ta vie d'entrepreneur.",
    ].join("\n"),
    temoignage: [
      "",
      `Avant : epuise, isole, au bord du gouffre.`,
      "",
      `Le declencheur ? Realiser que ${topic} me detruisait a petit feu.`,
      "",
      "Apres un accompagnement adapte :",
      "- Sommeil retrouve",
      "- Energie stable",
      "- Business qui tourne (mieux qu'avant)",
      "",
      "Si j'ai pu le faire, toi aussi.",
    ].join("\n"),
    mythe_realite: [
      "",
      `La realite : ${topic} est un signal d'alarme, pas une faiblesse.`,
      "",
      "Les entrepreneurs les plus performants l'ont compris :",
      "prendre soin de soi, c'est prendre soin de son business.",
      "",
      "Action concrete :",
      "Fais le point en 2 minutes avec un test simple.",
    ].join("\n"),
    behind_scenes: [
      "",
      `En tant que coach, ${topic} est au coeur de mon quotidien.`,
      "",
      "Ce que je vois en coulisses :",
      "- Des entrepreneurs brillants qui s'epuisent en silence",
      "- Des signaux ignores pendant des mois",
      "- Des transformations incroyables quand on agit",
      "",
      "La transparence : 80% de mes clients arrivent trop tard.",
      "Sois dans les 20% qui agissent a temps.",
    ].join("\n"),
  };

  let post = hookMap[format] + bodyMap[format];
  post += `\n\n${cta}`;

  if (platform === "instagram") {
    post += `\n\n.\n.\n.\n${hashtags.join(" ")}`;
  } else {
    post += `\n\n${hashtags.join(" ")}`;
  }

  return post;
}

// ─── Content queue helpers ──────────────────────────────────────

interface QueueItem {
  id: string;
  content: string;
  platform: string;
  scheduled_date: string;
  scheduled_time: string;
  status: "pending" | "published" | "cancelled";
  created_at: string;
}

function readQueue(): QueueItem[] {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    const content = fs.readFileSync(QUEUE_FILE, "utf8");
    return JSON.parse(content) as QueueItem[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueItem[]): void {
  // Ensure directory exists
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function generateId(): string {
  return `cd-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

// ─── Engagement analysis ────────────────────────────────────────

interface EngagementAnalysis {
  score: number;
  hook_strength: "faible" | "moyen" | "fort";
  cta_strength: "faible" | "moyen" | "fort";
  readability: "faible" | "moyen" | "fort";
  suggestions: string[];
}

function analyzeEngagement(text: string, platform: PlatformType): EngagementAnalysis {
  let score = 50; // baseline
  const suggestions: string[] = [];
  const limits = PLATFORM_LIMITS[platform];

  // Hook analysis (first line)
  const firstLine = text.split("\n")[0] || "";
  let hookStrength: EngagementAnalysis["hook_strength"] = "moyen";

  if (firstLine.length < 10) {
    hookStrength = "faible";
    score -= 10;
    suggestions.push("Hook trop court — ajoute une phrase d'accroche percutante");
  } else if (
    firstLine.includes("?") ||
    firstLine.includes("!") ||
    firstLine.includes("FAUX") ||
    /\d/.test(firstLine)
  ) {
    hookStrength = "fort";
    score += 15;
  }

  // CTA analysis
  let ctaStrength: EngagementAnalysis["cta_strength"] = "faible";
  const textLower = text.toLowerCase();

  if (
    textLower.includes("stresszeroentrepreneur.fr") ||
    textLower.includes("rdv") ||
    textLower.includes("reserve")
  ) {
    ctaStrength = "fort";
    score += 10;
  } else if (
    textLower.includes("et toi") ||
    textLower.includes("dis-moi") ||
    textLower.includes("commentaire") ||
    textLower.includes("?")
  ) {
    ctaStrength = "moyen";
    score += 5;
  } else {
    suggestions.push("Ajoute un CTA clair a la fin du post");
  }

  // Length check
  if (text.length > (limits?.maxChars || 3000)) {
    score -= 15;
    suggestions.push(`Post trop long (${text.length}/${limits?.maxChars || 3000} chars) — raccourcis`);
  } else if (platform === "linkedin" && text.length < 200) {
    score -= 5;
    suggestions.push("Post un peu court pour LinkedIn — developpe davantage");
  } else if (platform === "linkedin" && text.length >= 500 && text.length <= 1500) {
    score += 10; // sweet spot LinkedIn
  }

  // Readability
  const lines = text.split("\n");
  const avgLineLength = text.length / Math.max(lines.length, 1);
  let readability: EngagementAnalysis["readability"] = "moyen";

  if (avgLineLength < 60 && lines.length > 5) {
    readability = "fort";
    score += 10;
  } else if (avgLineLength > 120) {
    readability = "faible";
    score -= 10;
    suggestions.push("Phrases trop longues — coupe en phrases plus courtes");
  }

  // Emoji check (StressZero rule: max 3)
  const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  if (emojiCount > 3) {
    score -= 5;
    suggestions.push(`Trop d'emojis (${emojiCount}) — max 3 pour StressZero`);
  } else if (emojiCount >= 1 && emojiCount <= 3) {
    score += 5;
  }

  // Hashtag check
  const hashtagCount = (text.match(/#\w+/g) || []).length;
  if (hashtagCount === 0) {
    suggestions.push("Ajoute 3-5 hashtags pertinents");
  } else if (hashtagCount > 5 && platform !== "instagram") {
    score -= 5;
    suggestions.push(`Trop de hashtags (${hashtagCount}) — max 5 pour ${platform}`);
  } else if (hashtagCount >= 3 && hashtagCount <= 5) {
    score += 5;
  }

  // Tutoiement check
  if (textLower.includes("vous ") || textLower.includes("votre ")) {
    score -= 5;
    suggestions.push("Utilise le tutoiement (tu/ton/ta) au lieu du vouvoiement");
  }

  // Positive signals
  if (textLower.includes("burnout") || textLower.includes("stress") || textLower.includes("epuisement")) {
    score += 5; // On-topic bonus
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  if (suggestions.length === 0) {
    suggestions.push("Bon post ! Continue comme ca.");
  }

  return { score, hook_strength: hookStrength, cta_strength: ctaStrength, readability, suggestions };
}

// ─── Repurpose helpers ──────────────────────────────────────────

function repurposeContent(text: string, sourcePlatform: PlatformType, targetPlatform: PlatformType): string {
  const targetLimits = PLATFORM_LIMITS[targetPlatform];
  const hashtags = selectHashtags(targetPlatform, targetPlatform === "instagram" ? 5 : 3);

  // Strip existing hashtags
  let cleaned = text.replace(/#\w+/g, "").trim();
  // Remove trailing dots (Instagram spacer)
  cleaned = cleaned.replace(/\n\.\n\.\n\.\n?/g, "\n").trim();

  let result: string;

  if (targetPlatform === "x") {
    // X/Twitter: ultra-concis, prendre le hook + CTA
    const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
    const hook = lines[0] || "";
    // Find a line that looks like a CTA
    const ctaLine = lines.find((l) =>
      l.includes("?") || l.toLowerCase().includes("stresszeroentrepreneur") || l.toLowerCase().includes("rdv"),
    );

    result = hook;
    if (ctaLine && ctaLine !== hook) {
      result += `\n\n${ctaLine}`;
    }
    result += `\n\n${hashtags.join(" ")}`;

    // Truncate to fit
    if (result.length > 280) {
      const hashtagStr = `\n\n${hashtags.join(" ")}`;
      const maxContent = 280 - hashtagStr.length;
      result = result.substring(0, maxContent - 3) + "..." + hashtagStr;
    }
  } else if (targetPlatform === "instagram") {
    // Instagram: caption + hashtags separated by dots
    result = cleaned;
    result += `\n\n.\n.\n.\n${hashtags.join(" ")}`;
  } else if (targetPlatform === "tiktok") {
    // TikTok: conversationnel, accroche video
    const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
    result = [
      `[Accroche video] ${lines[0] || ""}`,
      "",
      ...lines.slice(1, 5),
      "",
      `${hashtags.join(" ")}`,
    ].join("\n");
  } else {
    // LinkedIn: format with line breaks
    result = cleaned + `\n\n${hashtags.join(" ")}`;
  }

  // Final length check
  if (result.length > (targetLimits?.maxChars || 3000)) {
    const hashtagStr = hashtags.join(" ");
    const maxContent = (targetLimits?.maxChars || 3000) - hashtagStr.length - 10;
    result = result.substring(0, maxContent) + `...\n\n${hashtagStr}`;
  }

  return result;
}

// ─── Thread generation ──────────────────────────────────────────

function generateThread(topic: string, postsCount: number, platform: PlatformType): string[] {
  const isX = platform === "x";
  const maxChars = isX ? 280 : 3000;
  const hashtags = selectHashtags(platform, 3);

  const posts: string[] = [];

  // Post 1: Hook
  posts.push(
    isX
      ? `${topic} — Un thread important pour les entrepreneurs.\n\nJe t'explique en ${postsCount - 1} points.`
      : `${topic}\n\nUn sujet crucial dont on ne parle pas assez.\n\nJe t'explique tout dans ce thread.`,
  );

  // Middle posts: content
  const middleTopics = [
    `Le probleme :\nLa plupart des entrepreneurs ignorent les signaux de ${topic}.\nIls pensent que c'est normal.\nMais ca ne l'est pas.`,
    `Les signaux d'alerte :\n- Fatigue chronique\n- Irritabilite\n- Perte de motivation\n- Insomnie\nSi tu te reconnais, continue a lire.`,
    `Ce que j'ai appris en accompagnant 200+ entrepreneurs :\n${topic} n'est PAS un signe de faiblesse.\nC'est le signe d'un desequilibre corrigible.`,
    `La solution en 3 etapes :\n1. Identifier tes declencheurs\n2. Mettre en place 1 routine protectrice (10 min/jour)\n3. Te faire accompagner si besoin`,
    `Les resultats que je vois chez mes clients :\n- Sommeil retrouve en 2 semaines\n- Energie stable en 1 mois\n- Business qui tourne mieux qu'avant`,
    `L'erreur que font 90% des entrepreneurs :\nIls attendent d'etre au fond pour agir.\nN'attends pas.\nFais le point maintenant.`,
    `Un exercice a faire tout de suite :\nNote de 1 a 10 ton niveau de stress.\nSi c'est > 7, c'est un signal.\n\nFais notre test gratuit (2 min) : stresszeroentrepreneur.fr/test-burnout`,
  ];

  const middleCount = Math.min(postsCount - 2, middleTopics.length);
  for (let i = 0; i < middleCount; i++) {
    let content = middleTopics[i];
    if (isX && content.length > maxChars) {
      content = content.substring(0, maxChars - 10) + "...";
    }
    posts.push(content);
  }

  // Final post: CTA
  posts.push(
    [
      `Resume :\n${topic} est un sujet serieux.\nMais des solutions existent.`,
      "",
      "Tu veux savoir ou tu en es ?",
      "Fais le test burnout gratuit (2 min) : stresszeroentrepreneur.fr/test-burnout",
      "",
      "Ou telecharge le guide \"7 jours pour reprendre le controle\" : stresszeroentrepreneur.fr/guide-7-jours",
      "",
      `${hashtags.join(" ")}`,
    ].join("\n"),
  );

  // Number the posts
  return posts.map((p, i) => {
    const prefix = `[${i + 1}/${posts.length}]`;
    return `${prefix}\n${p}`;
  });
}

// ─── Carousel generation ────────────────────────────────────────

interface CarouselSlide {
  slide_number: number;
  title: string;
  body: string;
}

function generateCarousel(
  topic: string,
  slidesCount: number,
  style: "educational" | "storytelling" | "data",
): CarouselSlide[] {
  const slides: CarouselSlide[] = [];

  if (style === "educational") {
    slides.push({ slide_number: 1, title: topic, body: "Ce que tu dois savoir\n(Swipe pour decouvrir)" });
    const educationalContent = [
      { title: "Le probleme", body: `La plupart des entrepreneurs subissent ${topic} en silence.\nIls pensent que c'est le prix du succes.` },
      { title: "Pourquoi c'est grave", body: "Sans action, les consequences s'aggravent :\n- Sante physique\n- Relations\n- Performance business" },
      { title: "La solution existe", body: "En 3 etapes simples :\n1. Conscience\n2. Routine protectrice\n3. Accompagnement" },
      { title: "Etape 1 : Conscience", body: "Identifie tes signaux d'alerte.\nFatigue ? Irritabilite ? Insomnie ?\nNote-les pendant 7 jours." },
      { title: "Etape 2 : Routine", body: "10 minutes par jour suffisent.\nRespiration, gratitude, deconnexion.\nLe plus dur c'est de commencer." },
      { title: "Etape 3 : Accompagnement", body: "Tu n'as pas a tout porter seul.\nUn coach, un pair, un groupe.\nDemander de l'aide = force." },
      { title: "Les resultats", body: "Apres 30 jours :\n- Sommeil retrouve\n- Energie stable\n- Clarte mentale\n- Business qui tourne mieux" },
      { title: "A toi de jouer", body: "Fais le premier pas :\nTest burnout gratuit (2 min)\nstresszeroentrepreneur.fr/test-burnout" },
    ];
    const count = Math.min(slidesCount - 2, educationalContent.length);
    for (let i = 0; i < count; i++) {
      slides.push({ slide_number: i + 2, ...educationalContent[i] });
    }
    slides.push({
      slide_number: slides.length + 1,
      title: "Passe a l'action",
      body: `Teste ton niveau de burnout\nstresszeroentrepreneur.fr/test-burnout\n\n${BRAND.identity}`,
    });
  } else if (style === "storytelling") {
    slides.push({ slide_number: 1, title: topic, body: "L'histoire d'un entrepreneur\nqui a failli tout perdre" });
    const storyContent = [
      { title: "Le debut", body: "Il avait tout pour reussir.\nUn business qui cartonne.\nDes clients.\nDe l'ambition." },
      { title: "Les premiers signes", body: "Mais petit a petit...\nLes nuits raccourcissent.\nL'irritabilite monte.\nLe plaisir disparait." },
      { title: "Le deni", body: "\"C'est normal, c'est le prix a payer.\"\nIl se repetait ca chaque jour.\nPendant 18 mois." },
      { title: "La chute", body: "Un matin, il n'a pas pu se lever.\nLe corps a dit STOP.\nCe que l'esprit refusait d'entendre." },
      { title: "Le tournant", body: "Il a demande de l'aide.\nPas une faiblesse.\nLa decision la plus courageuse de sa vie." },
      { title: "La reconstruction", body: "Nouvelles routines. Nouvel equilibre.\nEn 90 jours, tout a change.\nSon business aussi." },
      { title: "Aujourd'hui", body: "Il performe MIEUX qu'avant.\nMais sans se detruire.\nLa preuve qu'un autre modele existe." },
    ];
    const count = Math.min(slidesCount - 2, storyContent.length);
    for (let i = 0; i < count; i++) {
      slides.push({ slide_number: i + 2, ...storyContent[i] });
    }
    slides.push({
      slide_number: slides.length + 1,
      title: "Et toi ?",
      body: `N'attends pas la chute.\nFais le point maintenant.\n\nstresszeroentrepreneur.fr/test-burnout`,
    });
  } else {
    // data
    slides.push({ slide_number: 1, title: topic, body: "Les chiffres qui devraient t'alerter\n(Swipe pour voir)" });
    const dataContent = [
      { title: "1 sur 3", body: "1 entrepreneur sur 3 est en situation de burnout.\nSource : Etude INSERM 2024" },
      { title: "x2.5", body: "Les entrepreneurs ont 2.5x plus de risque de burnout que les salaries." },
      { title: "63%", body: "63% des entrepreneurs ont deja eu des symptomes de burnout.\nSans le savoir." },
      { title: "18 mois", body: "Duree moyenne avant diagnostic.\n18 mois de souffrance evitable." },
      { title: "-40%", body: "Impact sur la productivite.\nLe burnout ne fait pas que te detruire.\nIl detruit ton business." },
      { title: "90 jours", body: "C'est le temps moyen pour retrouver l'equilibre.\nAvec un accompagnement adapte." },
      { title: "92%", body: "Des entrepreneurs accompagnes retrouvent un niveau d'energie satisfaisant en 3 mois." },
    ];
    const count = Math.min(slidesCount - 2, dataContent.length);
    for (let i = 0; i < count; i++) {
      slides.push({ slide_number: i + 2, ...dataContent[i] });
    }
    slides.push({
      slide_number: slides.length + 1,
      title: "Agis maintenant",
      body: `Test burnout gratuit (2 min)\nstresszeroentrepreneur.fr/test-burnout\n\n${BRAND.identity}`,
    });
  }

  // Ensure we have exactly the right number of slides
  return slides.slice(0, slidesCount);
}

// ─── MCP Server ─────────────────────────────────────────────────

const server = new McpServer(
  { name: "content-distribution-mcp", version: "1.0.0" },
  { capabilities: { logging: {} } },
);

// ─── Tool 1: draft_post ─────────────────────────────────────────

server.registerTool(
  "draft_post",
  {
    title: "Draft a Social Media Post",
    description:
      "Generate a post for a specific social platform (LinkedIn, Instagram, X/Twitter, TikTok). " +
      "Uses StressZero brand rules: tutoiement, max 3 emojis, 3-5 hashtags, phrases courtes. " +
      "Identity: Emmanuel Gomes Soares, Coach burnout entrepreneur.",
    inputSchema: {
      topic: z.string().describe("Post topic (e.g., 'burnout entrepreneur', 'gestion du stress')"),
      platform: z.enum(["linkedin", "instagram", "x", "tiktok"]).describe("Target platform"),
      format: z.enum([
        "hook_story", "stat_choc", "question", "framework",
        "temoignage", "mythe_realite", "behind_scenes",
      ]).describe("Post format/structure"),
      tone: z.enum(["empathique", "direct", "inspirant"]).default("empathique").describe("Writing tone"),
      cta_type: z.enum(["soft", "medium", "hard"]).default("soft").describe(
        "CTA intensity: soft (question), medium (free resource), hard (booking/DM)",
      ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ topic, platform, format, tone, cta_type }) => {
    const post = generatePost(topic, platform, format, tone, cta_type);

    return {
      content: [{ type: "text" as const, text: post }],
    };
  },
);

// ─── Tool 2: repurpose_content ──────────────────────────────────

server.registerTool(
  "repurpose_content",
  {
    title: "Repurpose Content for Another Platform",
    description:
      "Take content from one platform and adapt it for another. " +
      "Handles character limits (X: 280, LinkedIn: 3000, Instagram: 2200), " +
      "hashtag styles, and format differences automatically.",
    inputSchema: {
      original_text: z.string().describe("The original post content"),
      source_platform: z.enum(["linkedin", "instagram", "x", "tiktok"]).describe("Original platform"),
      target_platform: z.enum(["linkedin", "instagram", "x", "tiktok"]).describe("Target platform"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ original_text, source_platform, target_platform }) => {
    if (source_platform === target_platform) {
      return {
        content: [{ type: "text" as const, text: "Source et cible sont la meme plateforme. Aucune adaptation necessaire." }],
      };
    }

    const adapted = repurposeContent(original_text, source_platform, target_platform);
    const targetLimits = PLATFORM_LIMITS[target_platform];

    const output = [
      `--- REPURPOSE: ${source_platform.toUpperCase()} → ${target_platform.toUpperCase()} ---`,
      "",
      `Original: ${original_text.length} chars (${source_platform})`,
      `Adapte: ${adapted.length} chars (${target_platform}, max ${targetLimits?.maxChars || "?"})`,
      `Format: ${targetLimits?.format || "Standard"}`,
      "",
      "=== CONTENU ADAPTE ===",
      "",
      adapted,
      "",
      `--- ${adapted.length}/${targetLimits?.maxChars || "?"} caracteres ---`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: output }],
    };
  },
);

// ─── Tool 3: generate_carousel ──────────────────────────────────

server.registerTool(
  "generate_carousel",
  {
    title: "Generate Carousel Slides",
    description:
      "Generate LinkedIn/Instagram carousel slides with title + body per slide. " +
      "Supports educational, storytelling, and data-driven styles.",
    inputSchema: {
      topic: z.string().describe("Carousel topic"),
      slides_count: z.number().min(3).max(10).default(6).describe("Number of slides (3-10)"),
      style: z.enum(["educational", "storytelling", "data"]).default("educational").describe(
        "Carousel style: educational (step-by-step), storytelling (narrative), data (stats & numbers)",
      ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ topic, slides_count, style }) => {
    const slides = generateCarousel(topic, slides_count, style);

    const output = [
      `--- CAROUSEL ${style.toUpperCase()} (${slides.length} slides) ---`,
      `Sujet: ${topic}`,
      "",
    ];

    slides.forEach((slide) => {
      output.push(`=== Slide ${slide.slide_number} ===`);
      output.push(`TITRE: ${slide.title}`);
      output.push(`CONTENU:\n${slide.body}`);
      output.push("");
    });

    output.push(`--- ${slides.length} slides generees | Style: ${style} ---`);
    output.push(`Identite: ${BRAND.identity}`);

    return {
      content: [{ type: "text" as const, text: output.join("\n") }],
    };
  },
);

// ─── Tool 4: schedule_content ───────────────────────────────────

server.registerTool(
  "schedule_content",
  {
    title: "Schedule Content",
    description:
      "Save content to the publishing queue (content-queue.json). " +
      "Stores the post with platform, scheduled date/time, and status.",
    inputSchema: {
      content: z.string().describe("The post content to schedule"),
      platform: z.enum(["linkedin", "instagram", "x", "tiktok"]).describe("Target platform"),
      scheduled_date: z.string().describe("Scheduled date (YYYY-MM-DD)"),
      scheduled_time: z.string().default("09:00").describe("Scheduled time (HH:MM, default 09:00)"),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ content, platform, scheduled_date, scheduled_time }) => {
    const queue = readQueue();
    const item: QueueItem = {
      id: generateId(),
      content,
      platform,
      scheduled_date,
      scheduled_time,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    queue.push(item);
    writeQueue(queue);

    const output = [
      "Contenu ajoute a la file d'attente !",
      "",
      `ID: ${item.id}`,
      `Plateforme: ${platform}`,
      `Date: ${scheduled_date} a ${scheduled_time}`,
      `Statut: pending`,
      `Longueur: ${content.length} caracteres`,
      "",
      `Total en file: ${queue.length} posts`,
      `Fichier: ${QUEUE_FILE}`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: output }],
    };
  },
);

// ─── Tool 5: get_content_calendar ───────────────────────────────

server.registerTool(
  "get_content_calendar",
  {
    title: "Get Content Calendar",
    description:
      "View the content calendar/queue. Shows all scheduled content for the next N days.",
    inputSchema: {
      days_ahead: z.number().min(1).max(30).default(7).describe("Number of days to look ahead (1-30)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ days_ahead }) => {
    const queue = readQueue();
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + days_ahead);

    const todayStr = today.toISOString().split("T")[0];
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const upcoming = queue
      .filter((item) => {
        return item.scheduled_date >= todayStr! && item.scheduled_date <= cutoffStr!;
      })
      .sort((a, b) => {
        const dateCompare = a.scheduled_date.localeCompare(b.scheduled_date);
        if (dateCompare !== 0) return dateCompare;
        return a.scheduled_time.localeCompare(b.scheduled_time);
      });

    if (upcoming.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `Aucun contenu planifie pour les ${days_ahead} prochains jours.\n\nUtilise schedule_content pour ajouter du contenu a la file.`,
        }],
      };
    }

    const lines = [
      `=== Calendrier Contenu (${todayStr} → ${cutoffStr}) ===`,
      `${upcoming.length} posts planifies`,
      "",
    ];

    // Group by date
    const byDate: Record<string, QueueItem[]> = {};
    upcoming.forEach((item) => {
      if (!byDate[item.scheduled_date]) byDate[item.scheduled_date] = [];
      byDate[item.scheduled_date].push(item);
    });

    Object.entries(byDate).forEach(([date, items]) => {
      lines.push(`--- ${date} ---`);
      items.forEach((item) => {
        const preview = item.content.substring(0, 80).replace(/\n/g, " ");
        lines.push(`  [${item.scheduled_time}] ${item.platform.toUpperCase()} | ${item.status} | ${preview}...`);
        lines.push(`  ID: ${item.id}`);
      });
      lines.push("");
    });

    // Stats
    const byPlatform: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    upcoming.forEach((item) => {
      byPlatform[item.platform] = (byPlatform[item.platform] || 0) + 1;
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    });

    lines.push("--- Stats ---");
    lines.push(`Par plateforme: ${Object.entries(byPlatform).map(([p, c]) => `${p}: ${c}`).join(", ")}`);
    lines.push(`Par statut: ${Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(", ")}`);

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
);

// ─── Tool 6: analyze_post_performance ───────────────────────────

server.registerTool(
  "analyze_post_performance",
  {
    title: "Analyze Post Performance",
    description:
      "Analyze a post's text for predicted engagement. " +
      "Returns estimated engagement score (0-100), hook strength, CTA strength, " +
      "readability, and actionable improvement suggestions.",
    inputSchema: {
      text: z.string().describe("The post text to analyze"),
      platform: z.enum(["linkedin", "instagram", "x", "tiktok"]).describe("Target platform"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ text, platform }) => {
    const analysis = analyzeEngagement(text, platform);

    const output = [
      `=== Analyse Post ${platform.toUpperCase()} ===`,
      "",
      `Score engagement estime: ${analysis.score}/100`,
      "",
      `Hook: ${analysis.hook_strength.toUpperCase()}`,
      `CTA: ${analysis.cta_strength.toUpperCase()}`,
      `Lisibilite: ${analysis.readability.toUpperCase()}`,
      "",
      `Longueur: ${text.length}/${PLATFORM_LIMITS[platform]?.maxChars || "?"} caracteres`,
      "",
      "--- Suggestions d'amelioration ---",
      ...analysis.suggestions.map((s) => `  - ${s}`),
      "",
      "--- Regles StressZero ---",
      ...BRAND.tone_rules.map((r) => `  - ${r}`),
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: output }],
    };
  },
);

// ─── Tool 7: generate_thread ────────────────────────────────────

server.registerTool(
  "generate_thread",
  {
    title: "Generate Thread",
    description:
      "Generate a multi-post thread for X/Twitter or LinkedIn. " +
      "Creates numbered posts with transitions, including hook, content posts, and CTA finale.",
    inputSchema: {
      topic: z.string().describe("Thread topic"),
      posts_count: z.number().min(3).max(10).default(5).describe("Number of posts in the thread (3-10)"),
      platform: z.enum(["linkedin", "x"]).default("linkedin").describe("Platform (linkedin or x)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ topic, posts_count, platform }) => {
    const posts = generateThread(topic, posts_count, platform);
    const limits = PLATFORM_LIMITS[platform];

    const output = [
      `=== THREAD ${platform.toUpperCase()} (${posts.length} posts) ===`,
      `Sujet: ${topic}`,
      `Limite par post: ${limits?.maxChars || "?"} caracteres`,
      "",
    ];

    posts.forEach((post, i) => {
      output.push(`--- Post ${i + 1}/${posts.length} (${post.length} chars) ---`);
      output.push(post);
      output.push("");

      if (post.length > (limits?.maxChars || 3000)) {
        output.push(`ATTENTION: Ce post depasse la limite de ${limits?.maxChars} caracteres !`);
        output.push("");
      }
    });

    output.push(`--- Thread total: ${posts.length} posts ---`);
    output.push(`Identite: ${BRAND.identity}`);

    return {
      content: [{ type: "text" as const, text: output.join("\n") }],
    };
  },
);

// ─── Resource: content-queue ────────────────────────────────────

server.registerResource(
  "content-queue",
  "content-distribution://content-queue",
  {
    title: "Content Queue",
    description: "Current content publishing queue with scheduled posts across all platforms",
    mimeType: "application/json",
  },
  async (uri) => {
    const queue = readQueue();
    return {
      contents: [{ uri: uri.href, text: JSON.stringify(queue, null, 2) }],
    };
  },
);

// ─── Prompt: weekly_content_sprint ──────────────────────────────

server.registerPrompt(
  "weekly_content_sprint",
  {
    title: "Weekly Content Sprint",
    description: "Generate a week of content — 5 posts across platforms for StressZero Entrepreneur",
    argsSchema: {
      theme: z.string().default("burnout entrepreneur").describe(
        "Weekly theme (e.g., 'burnout entrepreneur', 'equilibre vie pro', 'signaux d'alerte')",
      ),
    },
  },
  ({ theme }) => {
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Lance un sprint contenu hebdomadaire pour StressZero Entrepreneur.`,
              `Theme de la semaine : ${theme}`,
              "",
              "Objectif : generer 5 posts pour la semaine, repartis sur les plateformes.",
              "",
              "Plan :",
              "1. LUNDI — LinkedIn post (format: hook_story, ton: empathique, CTA: soft)",
              "   Utilise draft_post avec ces parametres",
              "",
              "2. MARDI — Instagram carousel (style: educational, 6 slides)",
              "   Utilise generate_carousel",
              "",
              "3. MERCREDI — X/Twitter thread (5 posts)",
              "   Utilise generate_thread",
              "",
              "4. JEUDI — LinkedIn post (format: stat_choc, ton: direct, CTA: medium)",
              "   Utilise draft_post",
              "",
              "5. VENDREDI — Instagram post (format: temoignage, ton: inspirant, CTA: medium)",
              "   Utilise draft_post + repurpose_content pour adapter le LinkedIn de lundi",
              "",
              "Pour chaque post :",
              "- Genere le contenu avec l'outil appropriate",
              "- Analyse avec analyze_post_performance",
              "- Planifie avec schedule_content (horaires : 9h LI, 12h IG, 18h X)",
              "",
              "Regles StressZero :",
              "- Tutoiement obligatoire",
              "- Max 3 emojis par post",
              "- 3-5 hashtags",
              "- Phrases courtes",
              `- Identite : ${BRAND.identity}`,
              `- Site : ${BRAND.site}`,
            ].join("\n"),
          },
        },
      ],
    };
  },
);

// ─── Startup ────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Content Distribution MCP server running on stdio");
  console.error(`Content dir: ${CONTENT_DIR}`);
  console.error(`Queue file: ${QUEUE_FILE}`);
  console.error(
    "Tools: draft_post, repurpose_content, generate_carousel, schedule_content, get_content_calendar, analyze_post_performance, generate_thread",
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
