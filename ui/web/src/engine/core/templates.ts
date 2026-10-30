import type { Advisory, Lang, SeverityInfo } from "./types";
import type { KnowledgeCard } from "./knowledge";

export const T: Record<Lang, Record<string, string>> = {
  en: {
    retake_diag: "Photo not clear enough",
    retake_action:
      "Take a new, sharp photo of one leaf in daylight, filling most of the frame.",
    refer_action:
      "If the problem continues, contact your local agriculture extension officer.",
    unsupported_diag: "Crop not supported",
    fallback_action:
      "A safe automatic answer could not be prepared. Remove badly affected leaves and contact your local extension officer for treatment advice.",
    refusal_diag: "Product request declined",
    refusal_action:
      "The product you asked about is not permitted. Ask your extension officer for an approved alternative.",
    safety:
      "Wear gloves and a mask when handling any crop-protection product and follow the product label.",
    healthy_diag: "Healthy",
    healthy_action:
      "No disease detected. Keep monitoring the plants regularly.",
    generic_disease_1:
      "Remove the badly affected leaves and keep them away from healthy plants.",
    generic_disease_2:
      "Avoid wetting the leaves and do not work in a wet field, so the problem does not spread.",
    generic_pest_1:
      "Look under the leaves and along the stems to find and count the insects.",
    generic_pest_2:
      "Pick off the insects you can see and remove badly damaged leaves.",
    severity_high:
      "Many leaves are affected. Contact your local agriculture extension officer soon for treatment advice.",
    unsupported_action:
      "This crop is not supported yet. Please contact an extension officer.",
    dosage_missing:
      "No vetted dosage is available for this case. Ask your extension officer.",
  },
  hi: {
    retake_diag: "फोटो पर्याप्त स्पष्ट नहीं है",
    retake_action:
      "दिन की रोशनी में एक पत्ती की नई, साफ़ फोटो लें जो फ्रेम को ज़्यादातर भर दे।",
    refer_action:
      "समस्या बनी रहे तो अपने स्थानीय कृषि विस्तार अधिकारी से संपर्क करें।",
    unsupported_diag: "यह फसल समर्थित नहीं है",
    fallback_action:
      "सुरक्षित स्वचालित उत्तर तैयार नहीं हो सका। ज़्यादा प्रभावित पत्तियाँ हटाएँ और उपचार की सलाह के लिए स्थानीय विस्तार अधिकारी से संपर्क करें।",
    refusal_diag: "उत्पाद का अनुरोध अस्वीकृत",
    refusal_action:
      "आपने जिस उत्पाद के बारे में पूछा वह अनुमत नहीं है। अनुमोदित विकल्प के लिए विस्तार अधिकारी से पूछें।",
    safety:
      "किसी भी फसल सुरक्षा उत्पाद को संभालते समय दस्ताने और मास्क पहनें और लेबल के निर्देश मानें।",
    healthy_diag: "स्वस्थ",
    healthy_action: "कोई रोग नहीं मिला। पौधों की नियमित निगरानी करते रहें।",
    generic_disease_1:
      "बहुत प्रभावित पत्तियाँ हटा दें और उन्हें स्वस्थ पौधों से दूर रखें।",
    generic_disease_2:
      "पत्तियों को गीला न करें और गीले खेत में काम करने से बचें, ताकि समस्या न फैले।",
    generic_pest_1: "पत्तियों के नीचे और तनों पर कीड़ों को ढूँढें और गिनें।",
    generic_pest_2:
      "जो कीड़े दिखें उन्हें हाथ से हटाएँ और बुरी तरह खराब पत्तियाँ निकाल दें।",
    severity_high:
      "बहुत सी पत्तियाँ प्रभावित हैं। उपचार की सलाह के लिए जल्द अपने स्थानीय कृषि विस्तार अधिकारी से संपर्क करें।",
    unsupported_action:
      "यह फसल अभी समर्थित नहीं है। कृपया विस्तार अधिकारी से संपर्क करें।",
    dosage_missing:
      "इस मामले के लिए प्रमाणित मात्रा उपलब्ध नहीं है। विस्तार अधिकारी से पूछें।",
  },
  mr: {
    retake_diag: "फोटो पुरेसा स्पष्ट नाही",
    retake_action:
      "दिवसाच्या प्रकाशात एका पानाचा नवीन, स्पष्ट फोटो घ्या जो फ्रेम बहुतांश भरेल.",
    refer_action:
      "समस्या कायम राहिल्यास तुमच्या स्थानिक कृषी विस्तार अधिकाऱ्याशी संपर्क करा.",
    unsupported_diag: "हे पीक समर्थित नाही",
    fallback_action:
      "सुरक्षित स्वयंचलित उत्तर तयार करता आले नाही. जास्त बाधित पाने काढून टाका आणि उपचार सल्ल्यासाठी स्थानिक विस्तार अधिकाऱ्याशी संपर्क करा.",
    refusal_diag: "उत्पादनाची विनंती नाकारली",
    refusal_action:
      "तुम्ही विचारलेले उत्पादन परवानगीयोग्य नाही. मंजूर पर्यायासाठी विस्तार अधिकाऱ्याला विचारा.",
    safety:
      "कोणतेही पीक संरक्षण उत्पादन हाताळताना हातमोजे आणि मास्क वापरा आणि लेबलवरील सूचना पाळा.",
    healthy_diag: "निरोगी",
    healthy_action: "कोणताही रोग आढळला नाही. झाडांवर नियमित लक्ष ठेवा.",
    generic_disease_1:
      "जास्त बाधित पाने काढून टाका आणि ती निरोगी झाडांपासून दूर ठेवा.",
    generic_disease_2:
      "पाने ओली करणे टाळा आणि ओल्या शेतात काम करू नका, म्हणजे समस्या पसरणार नाही.",
    generic_pest_1: "पानांच्या खाली आणि खोडांवर किडे शोधा आणि मोजा.",
    generic_pest_2:
      "दिसणारे किडे हाताने काढा आणि खूप खराब झालेली पाने काढून टाका.",
    severity_high:
      "अनेक पाने बाधित आहेत. उपचार सल्ल्यासाठी लवकर स्थानिक कृषी विस्तार अधिकाऱ्याशी संपर्क करा.",
    unsupported_action:
      "हे पीक अद्याप समर्थित नाही. कृपया विस्तार अधिकाऱ्याशी संपर्क करा.",
    dosage_missing:
      "या प्रकरणासाठी प्रमाणित मात्रा उपलब्ध नाही. विस्तार अधिकाऱ्याला विचारा.",
  },
  te: {
    retake_diag: "ఫోటో తగినంత స్పష్టంగా లేదు",
    retake_action:
      "పగటి వెలుతురులో ఒక ఆకు యొక్క కొత్త, స్పష్టమైన ఫోటో తీయండి; ఫ్రేమ్‌లో ఎక్కువ భాగం నిండేలా చూడండి.",
    refer_action:
      "సమస్య కొనసాగితే మీ స్థానిక వ్యవసాయ విస్తరణ అధికారిని సంప్రదించండి.",
    unsupported_diag: "ఈ పంటకు మద్దతు లేదు",
    fallback_action:
      "సురక్షితమైన స్వయంచాలక సమాధానాన్ని సిద్ధం చేయలేకపోయాము. బాగా దెబ్బతిన్న ఆకులను తొలగించి, చికిత్స సలహా కోసం మీ స్థానిక విస్తరణ అధికారిని సంప్రదించండి.",
    refusal_diag: "ఉత్పత్తి అభ్యర్థన తిరస్కరించబడింది",
    refusal_action:
      "మీరు అడిగిన ఉత్పత్తికి అనుమతి లేదు. ఆమోదించిన ప్రత్యామ్నాయం కోసం మీ విస్తరణ అధికారిని అడగండి.",
    safety:
      "ఏదైనా పంట రక్షణ ఉత్పత్తిని వాడేటప్పుడు చేతి తొడుగులు మరియు మాస్క్ ధరించండి, లేబుల్ సూచనలను పాటించండి.",
    healthy_diag: "ఆరోగ్యంగా ఉంది",
    healthy_action:
      "ఎలాంటి వ్యాధి కనుగొనబడలేదు. మొక్కలను క్రమం తప్పకుండా గమనిస్తూ ఉండండి.",
    generic_disease_1:
      "బాగా దెబ్బతిన్న ఆకులను తొలగించి, ఆరోగ్యకరమైన మొక్కలకు దూరంగా ఉంచండి.",
    generic_disease_2:
      "ఆకులను తడపకండి, తడి పొలంలో పని చేయకండి, తద్వారా సమస్య వ్యాపించదు.",
    generic_pest_1: "ఆకుల అడుగున మరియు కాండాలపై పురుగులను వెతికి లెక్కించండి.",
    generic_pest_2:
      "కనిపించే పురుగులను చేతితో తీసివేయండి, బాగా దెబ్బతిన్న ఆకులను తొలగించండి.",
    severity_high:
      "చాలా ఆకులు దెబ్బతిన్నాయి. చికిత్స సలహా కోసం త్వరగా మీ స్థానిక వ్యవసాయ విస్తరణ అధికారిని సంప్రదించండి.",
    unsupported_action:
      "ఈ పంటకు ఇంకా మద్దతు లేదు. దయచేసి విస్తరణ అధికారిని సంప్రదించండి.",
    dosage_missing:
      "ఈ కేసుకు ధృవీకరించిన మోతాదు అందుబాటులో లేదు. మీ విస్తరణ అధికారిని అడగండి.",
  },
};

export const SEVERITY_LABELS: Record<Lang, Record<number, string>> = {
  en: {
    "1": "Very Low",
    "2": "Low",
    "3": "Moderate",
    "4": "High",
    "5": "Severe",
  },
  hi: {
    "1": "बहुत कम",
    "2": "कम",
    "3": "मध्यम",
    "4": "अधिक",
    "5": "गंभीर",
  },
  mr: {
    "1": "खूप कमी",
    "2": "कमी",
    "3": "मध्यम",
    "4": "जास्त",
    "5": "तीव्र",
  },
  te: {
    "1": "చాలా తక్కువ",
    "2": "తక్కువ",
    "3": "మధ్యస్థం",
    "4": "ఎక్కువ",
    "5": "తీవ్రం",
  },
};

export const DEFAULT_SEVERITY_LABELS: Record<number, string> = {
  1: "Very Low",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Severe",
};

type ActionPair = [string, "critical" | "high" | "normal"];

function text(lang: Lang, key: string): string {
  return T[lang][key] ?? "";
}

function base(
  lang: Lang,
  diag: string,
  conf: number,
  actions: ActionPair[],
  severity: SeverityInfo | null,
): Advisory {
  return {
    schema_version: "advisory_v3",
    diagnosis: {
      primary: diag,
      confidence: Math.round(conf * 10000) / 10000,
      differential: [],
    },
    severity,
    actions: actions.map(([t, priority]) => ({ text: t, priority })),
    tool_call: null,
    preventive: [],
    safety_notice: text(lang, "safety"),
    lang,
  };
}

export function retake(lang: Lang, confidence: number): Advisory {
  return base(
    lang,
    text(lang, "retake_diag"),
    confidence,
    [
      [text(lang, "retake_action"), "critical"],
      [text(lang, "refer_action"), "normal"],
    ],
    null,
  );
}

export function unsupported(lang: Lang): Advisory {
  return base(
    lang,
    text(lang, "unsupported_diag"),
    0,
    [[text(lang, "unsupported_action"), "critical"]],
    null,
  );
}

export function refusal(
  lang: Lang,
  diag: string | null,
  confidence: number,
): Advisory {
  return base(
    lang,
    diag ?? text(lang, "refusal_diag"),
    confidence,
    [
      [text(lang, "refusal_action"), "critical"],
      [text(lang, "refer_action"), "normal"],
    ],
    null,
  );
}

export function fallback(
  lang: Lang,
  diag: string,
  confidence: number,
  severity: SeverityInfo | null,
): Advisory {
  return base(
    lang,
    diag,
    confidence,
    [[text(lang, "fallback_action"), "critical"]],
    severity,
  );
}

export function healthy(lang: Lang, confidence: number): Advisory {
  return base(
    lang,
    text(lang, "healthy_diag"),
    confidence,
    [[text(lang, "healthy_action"), "normal"]],
    null,
  );
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

export function generic(
  lang: Lang,
  kind: "disease" | "pest",
  diag: string,
  conf: number,
  severity: SeverityInfo | null,
): Advisory {
  const prefix = kind === "pest" ? "generic_pest" : "generic_disease";
  const actions: ActionPair[] = [];
  if (severity !== null && severity.level >= 4)
    actions.push([text(lang, "severity_high"), "critical"]);
  actions.push(
    [text(lang, `${prefix}_1`), kind === "pest" ? "high" : "critical"],
    [text(lang, `${prefix}_2`), "high"],
    [text(lang, "refer_action"), "normal"],
  );
  return base(lang, diag, conf, actions, severity);
}

export function fromCard(
  card: KnowledgeCard,
  conf: number,
  severity: SeverityInfo | null,
): Advisory {
  const lang = card.lang;
  const ordered = card.actions
    .map((a, i) => ({ a, i }))
    .sort(
      (x, y) =>
        (PRIORITY_RANK[x.a.priority] ?? 2) -
          (PRIORITY_RANK[y.a.priority] ?? 2) || x.i - y.i,
    )
    .map(({ a }) => a);
  const actions: Advisory["actions"] = [];
  if (severity !== null && severity.level >= 4)
    actions.push({ text: text(lang, "severity_high"), priority: "critical" });
  for (const a of ordered)
    actions.push({ text: a.text.slice(0, 600), priority: a.priority });
  const diag = card.kind === "pest" ? card.name : `${card.crop} ${card.name}`;
  const adv = base(lang, diag.slice(0, 120), conf, [], severity);
  adv.actions = actions.slice(0, 12);
  adv.preventive = card.prevention.slice(0, 12).map((p) => p.slice(0, 400));
  adv.details = {
    summary: card.summary.slice(0, 600),
    symptoms: card.symptoms.slice(0, 8).map((s) => s.slice(0, 300)),
    causes: card.causes.slice(0, 6).map((s) => s.slice(0, 300)),
    ...(card.help !== undefined ? { help: card.help.slice(0, 300) } : {}),
    sources: card.sources
      .slice(0, 6)
      .map((s) => ({ title: s.title.slice(0, 160), url: s.url.slice(0, 300) })),
  };
  return adv;
}
