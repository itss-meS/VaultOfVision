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
      "This crop or photo is not supported on this device. Please contact an extension officer.",
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
    nodata_general:
      "The scan found a possible plant health problem. Detailed advice for this crop and problem is not available on this device yet.",
    nodata_refer:
      "Show the affected plant to your local agriculture extension officer and ask for advice before using any spray.",
    healthy_tip1:
      "Check leaves and stems every week, including the underside of leaves, so problems are found early.",
    healthy_tip2:
      "Water at the base of the plant and avoid keeping the leaves wet for long periods.",
    healthy_tip3:
      "Remove fallen leaves and weeds and keep tools clean to reduce the spread of disease and insects.",
  },
  hi: {
    retake_diag: "फोटो पर्याप्त स्पष्ट नहीं है",
    retake_action:
      "दिन की रोशनी में एक पत्ती की नई, साफ़ फोटो लें जो फ्रेम को ज़्यादातर भर दे।",
    refer_action:
      "समस्या बनी रहे तो अपने स्थानीय कृषि विस्तार अधिकारी से संपर्क करें।",
    unsupported_diag: "यह फसल समर्थित नहीं है",
    unsupported_action:
      "यह फसल या फोटो इस उपकरण पर समर्थित नहीं है। कृपया विस्तार अधिकारी से संपर्क करें।",
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
    nodata_general:
      "स्कैन में पौधे के स्वास्थ्य की एक संभावित समस्या मिली है। इस फसल और समस्या के लिए विस्तृत सलाह अभी इस उपकरण पर उपलब्ध नहीं है।",
    nodata_refer:
      "प्रभावित पौधा अपने स्थानीय कृषि विस्तार अधिकारी को दिखाएँ और कोई भी छिड़काव करने से पहले उनसे सलाह लें।",
    healthy_tip1:
      "हर हफ्ते पत्तियों और तनों की, पत्तियों के निचले हिस्से सहित, जाँच करें ताकि समस्या जल्दी पकड़ में आए।",
    healthy_tip2:
      "पौधे की जड़ के पास पानी दें और पत्तियों को लंबे समय तक गीला न रहने दें।",
    healthy_tip3:
      "गिरी हुई पत्तियाँ और खरपतवार हटाएँ और औज़ार साफ़ रखें, ताकि रोग और कीटों का फैलाव कम हो।",
  },
  mr: {
    retake_diag: "फोटो पुरेसा स्पष्ट नाही",
    retake_action:
      "दिवसाच्या प्रकाशात एका पानाचा नवीन, स्पष्ट फोटो घ्या जो फ्रेम बहुतांश भरेल.",
    refer_action:
      "समस्या कायम राहिल्यास तुमच्या स्थानिक कृषी विस्तार अधिकाऱ्याशी संपर्क करा.",
    unsupported_diag: "हे पीक समर्थित नाही",
    unsupported_action:
      "हे पीक किंवा फोटो या उपकरणावर समर्थित नाही. कृपया विस्तार अधिकाऱ्याशी संपर्क करा.",
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
    nodata_general:
      "स्कॅनमध्ये वनस्पतीच्या आरोग्याची संभाव्य समस्या आढळली आहे. या पिकासाठी आणि समस्येसाठी सविस्तर सल्ला अद्याप या उपकरणावर उपलब्ध नाही.",
    nodata_refer:
      "बाधित झाड तुमच्या स्थानिक कृषी विस्तार अधिकाऱ्याला दाखवा आणि कोणतीही फवारणी करण्यापूर्वी त्यांचा सल्ला घ्या.",
    healthy_tip1:
      "दर आठवड्याला पानांची आणि खोडांची, पानांच्या खालच्या बाजूसह, तपासणी करा म्हणजे समस्या लवकर लक्षात येईल.",
    healthy_tip2:
      "झाडाच्या बुडाशी पाणी द्या आणि पाने जास्त वेळ ओली राहू देऊ नका.",
    healthy_tip3:
      "गळलेली पाने आणि तण काढून टाका आणि अवजारे स्वच्छ ठेवा म्हणजे रोग आणि किडींचा प्रसार कमी होईल.",
  },
  te: {
    retake_diag: "ఫోటో తగినంత స్పష్టంగా లేదు",
    retake_action:
      "పగటి వెలుతురులో ఒక ఆకు యొక్క కొత్త, స్పష్టమైన ఫోటో తీయండి; ఫ్రేమ్‌లో ఎక్కువ భాగం నిండేలా చూడండి.",
    refer_action:
      "సమస్య కొనసాగితే మీ స్థానిక వ్యవసాయ విస్తరణ అధికారిని సంప్రదించండి.",
    unsupported_diag: "ఈ పంటకు మద్దతు లేదు",
    unsupported_action:
      "ఈ పంట లేదా ఫోటోకు ఈ పరికరంలో మద్దతు లేదు. దయచేసి విస్తరణ అధికారిని సంప్రదించండి.",
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
    dosage_missing:
      "ఈ కేసుకు ధృవీకరించిన మోతాదు అందుబాటులో లేదు. మీ విస్తరణ అధికారిని అడగండి.",
    nodata_general:
      "స్కాన్‌లో మొక్క ఆరోగ్యానికి సంబంధించిన ఒక సమస్య ఉండే అవకాశం కనిపించింది. ఈ పంట మరియు సమస్యకు వివరణాత్మక సలహా ప్రస్తుతం ఈ పరికరంలో అందుబాటులో లేదు.",
    nodata_refer:
      "ప్రభావితమైన మొక్కను మీ స్థానిక వ్యవసాయ విస్తరణ అధికారికి చూపించి, ఏదైనా పిచికారీ చేసే ముందు వారి సలహా తీసుకోండి.",
    healthy_tip1:
      "సమస్యలను ముందుగానే గుర్తించడానికి ప్రతి వారం ఆకులు, కాండాలను, ఆకుల కింది వైపుతో సహా, పరిశీలించండి.",
    healthy_tip2:
      "మొక్క మొదలు దగ్గర నీరు పోయండి; ఆకులు ఎక్కువసేపు తడిగా ఉండకుండా చూడండి.",
    healthy_tip3:
      "రాలిన ఆకులను, కలుపు మొక్కలను తొలగించండి; వ్యాధులు, పురుగుల వ్యాప్తి తగ్గడానికి పనిముట్లను శుభ్రంగా ఉంచండి.",
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
  preventive: string[] = [],
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
    preventive,
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
    [
      text(lang, "healthy_tip1"),
      text(lang, "healthy_tip2"),
      text(lang, "healthy_tip3"),
    ],
  );
}

export function noData(
  lang: Lang,
  diag: string,
  confidence: number,
  severity: SeverityInfo | null,
): Advisory {
  return base(
    lang,
    diag,
    confidence,
    [
      [text(lang, "nodata_general"), "normal"],
      [text(lang, "dosage_missing"), "critical"],
      [text(lang, "nodata_refer"), "high"],
    ],
    severity,
  );
}
