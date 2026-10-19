import type { Advisory, Lang, SeverityInfo } from "./types";

export const T: Record<Lang, Record<string, string>> = {
  en: {
    retake_diag: "Photo not clear enough",
    retake_action:
      "Take a new, sharp photo of one leaf in daylight, filling most of the frame.",
    refer_action:
      "If the problem continues, contact your local agriculture extension officer.",
    unsupported_diag: "Crop not supported",
    unsupported_action:
      "This device currently supports tomato only. Please contact an extension officer.",
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
    unsupported_action:
      "यह उपकरण अभी केवल टमाटर के लिए है। कृपया विस्तार अधिकारी से संपर्क करें।",
    fallback_action:
      "सुरक्षित स्वचालित उत्तर तैयार नहीं हो सका। ज़्यादा प्रभावित पत्तियाँ हटाएँ और उपचार की सलाह के लिए स्थानीय विस्तार अधिकारी से संपर्क करें।",
    refusal_diag: "उत्पाद का अनुरोध अस्वीकृत",
    refusal_action:
      "आपने जिस उत्पाद के बारे में पूछा वह अनुमत नहीं है। अनुमोदित विकल्प के लिए विस्तार अधिकारी से पूछें।",
    safety:
      "किसी भी फसल सुरक्षा उत्पाद को संभालते समय दस्ताने और मास्क पहनें और लेबल के निर्देश मानें।",
    healthy_diag: "स्वस्थ",
    healthy_action: "कोई रोग नहीं मिला। पौधों की नियमित निगरानी करते रहें।",
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
    unsupported_action:
      "हे उपकरण सध्या फक्त टोमॅटोसाठी आहे. कृपया विस्तार अधिकाऱ्याशी संपर्क करा.",
    fallback_action:
      "सुरक्षित स्वयंचलित उत्तर तयार करता आले नाही. जास्त बाधित पाने काढून टाका आणि उपचार सल्ल्यासाठी स्थानिक विस्तार अधिकाऱ्याशी संपर्क करा.",
    refusal_diag: "उत्पादनाची विनंती नाकारली",
    refusal_action:
      "तुम्ही विचारलेले उत्पादन परवानगीयोग्य नाही. मंजूर पर्यायासाठी विस्तार अधिकाऱ्याला विचारा.",
    safety:
      "कोणतेही पीक संरक्षण उत्पादन हाताळताना हातमोजे आणि मास्क वापरा आणि लेबलवरील सूचना पाळा.",
    healthy_diag: "निरोगी",
    healthy_action: "कोणताही रोग आढळला नाही. झाडांवर नियमित लक्ष ठेवा.",
    dosage_missing:
      "या प्रकरणासाठी प्रमाणित मात्रा उपलब्ध नाही. विस्तार अधिकाऱ्याला विचारा.",
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
