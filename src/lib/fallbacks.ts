// Deterministic fallbacks used when the LLM is unavailable. Clearly labelled in their text.
import type { Persona } from "./score.ts";
import { HUBS } from "./hubs.ts";

const num = (s: string) => Number(s.replace(",", "."));

export function personaFallback(text: string, locale: string = "az"): Persona {
  const t = text.toLocaleLowerCase("az");
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  let budget: number | null = null;
  const m = t.match(/(\d+[.,]?\d*)\s*(min|k|000)?\s*(manat|azn|₼|\$|dollar)?/);
  if (m && (m[2] || m[3])) {
    budget = num(m[1]) * (m[2] === "min" || m[2] === "k" ? 1000 : 1);
    if (m[3] === "$" || m[3] === "dollar") budget *= 1.7;
    if (budget < 1000) budget = null;
  }
  const kids = has("uşaq", "ailə", "övlad", "kids", "children", "family");
  const student = has("tələbə", "universitet", "student", "university");
  const retiree = has("təqaüd", "pensiya", "yaşlı", "retired", "pensioner");
  const house = has("həyət", "bağ evi", "villa", "house", "garden");
  const land = has("torpaq", "sot", "land", "plot");
  const shop = has("obyekt", "mağaza", "biznes", "shop", "business");
  let hub: string | null = null;
  for (const [id, name] of Object.entries(HUBS)) {
    const stem = name.split(" ")[0].toLocaleLowerCase("az").slice(0, 5);
    if (t.includes(stem)) hub = id;
  }
  const mode = has("metro") ? "metro" : has("maşın", "avtomobil") ? "car" : has("piyada") ? "walk" : "bus";
  return {
    property_type: land ? "torpaq" : shop ? "obyekt" : house ? "heyet_evi" : has("yeni tikili") ? "menzil_yeni" : "menzil_kohne",
    budget_azn: budget,
    desired_m2: land ? null : house ? 120 : kids ? 80 : 50,
    work_hub_id: hub ?? (retiree ? null : "bk-nesimi"),
    mode,
    weights: {
      rahatliq: 0.6,
      neqliyyat: has("metro", "nəqliyyat", "iş") || student ? 0.9 : 0.4,
      tehsil: kids || student ? 1 : 0.1,
      sehiyye: retiree || has("xəstəxana") ? 1 : 0.4,
      tebiet: has("sakit", "təbiət", "hava", "dəniz", "yaşıl") || retiree ? 1 : 0.3,
      infrastruktur: 0.4,
      elcatanliq: has("ucuz", "büdcə", "qənaət") || student || budget ? 0.9 : 0.5,
    },
    hard_requirements: [],
    summary_az: `${text.slice(0, 70)}${text.length > 70 ? "…" : ""} ${locale === "en" ? "(simple rule-based analysis; the AI is unavailable right now)" : "(sadə qayda ilə təhlil — AI hazırda əlçatan deyil)"}`,
  };
}

const PHRASES: { re: RegExp; phrase: string; meaning: string; meaning_en: string; risk: "yüksək" | "orta" | "aşağı" }[] = [
  { re: /çıxarışsız|cixarissiz/i, phrase: "çıxarışsız", meaning: "Mülkiyyət hüququ dövlət reyestrində qeydiyyatda deyil. Satıcının sahib olduğu sənədlə sübut olunmur; ikiqat satış və mübahisə riski var.", meaning_en: "(no title extract) Ownership is not registered in the state property register, so the seller cannot prove ownership with a document; there is a risk of double sale and disputes.", risk: "yüksək" },
  { re: /kupçasız|kupcasiz/i, phrase: "kupçasız", meaning: "Mülkiyyət sənədi (kupça/çıxarış) yoxdur. Ev üzərində hüququnuz yalnız satıcı ilə müqaviləyə əsaslanacaq.", meaning_en: "(no title deed) There is no ownership document (kupça/çıxarış). Your rights to the home would rest only on a contract with the seller.", risk: "yüksək" },
  { re: /kupça hazırlanır|kupca hazirlanir|sənəd sonra/i, phrase: "kupça hazırlanır", meaning: "Sənəd hələ yoxdur; tikinti qeydiyyatdan keçməyə bilər. Nə vaxt hazır olacağına zəmanət yoxdur.", meaning_en: "(title deed being prepared) The document does not exist yet and the building may never be registered. There is no guarantee when it will be ready.", risk: "yüksək" },
  { re: /müqavilə ilə|muqavile ile/i, phrase: "müqavilə ilə", meaning: "Satış notarial qaydada qeydiyyata alınmayan sadə müqavilə ilə aparılır; hüquqi qorunma zəifdir.", meaning_en: "(by simple contract) The sale uses a simple contract that is not notarised and registered; legal protection is weak.", risk: "orta" },
  { re: /etibarnamə ilə|etibarname ile/i, phrase: "etibarnamə ilə", meaning: "Satıcı mülkiyyətçi deyil, etibarnamə ilə hərəkət edir. Etibarnamə ləğv oluna və ya saxta ola bilər.", meaning_en: "(sold under power of attorney) The seller is not the owner but acts under a power of attorney, which can be revoked or forged.", risk: "yüksək" },
  { re: /ipotekaya yararsız|ipotekaya yararsiz|kreditə yararsız/i, phrase: "ipotekaya yararsız", meaning: "Banklar bu əmlakı girov kimi qəbul etmir — adətən sənəd və ya tikinti statusu ilə bağlı problem var.", meaning_en: "(not eligible for a mortgage) Banks will not accept this property as collateral, which usually points to a problem with documents or construction status.", risk: "orta" },
  { re: /yarımçıq tikili|yarimciq tikili|tikili davam edir/i, phrase: "yarımçıq tikili", meaning: "Bina tamamlanmayıb; tikintinin dayanması və istismara qəbul edilməməsi riski var.", meaning_en: "(unfinished building) The building is not complete; there is a risk that construction stops or it is never approved for use.", risk: "yüksək" },
  { re: /qeydiyyatsız|qeydiyyatsiz/i, phrase: "qeydiyyatsız", meaning: "Əmlak və ya tikinti rəsmi qeydiyyatda deyil.", meaning_en: "(unregistered) The property or building is not officially registered.", risk: "yüksək" },
];

export function legalDetect(text: string, locale: string = "az") {
  return PHRASES.filter((p) => p.re.test(text)).map(({ phrase, meaning, meaning_en, risk }) => ({ phrase, meaning: locale === "en" ? meaning_en : meaning, risk }));
}

export const LEGAL_CHECKLIST = [
  { step: "Daşınmaz əmlakın dövlət reyestrindən çıxarışı yoxla (mülkiyyətçi, girov, həbs)", where: "Əmlak Məsələləri Dövlət Xidməti / e-gov.az", document: "Reyestrdən çıxarış" },
  { step: "Satıcının şəxsiyyətini və mülkiyyətçi ilə eyni olduğunu yoxla", where: "Notarius", document: "Şəxsiyyət vəsiqəsi, çıxarış" },
  { step: "Əmlak üzərində həbs, girov və ya məhkəmə mübahisəsi olmadığını soruş", where: "Notarius / reyestr", document: "Arayış" },
  { step: "Kommunal borcların olmadığını yoxla", where: "Azəriqaz, Azərişıq, Azərsu", document: "Borc arayışı" },
  { step: "Alqı-satqı müqaviləsini notarial qaydada bağla və qeydiyyata ver", where: "Notarius", document: "Notarial alqı-satqı müqaviləsi" },
];

export const LEGAL_CHECKLIST_EN = [
  { step: "Get an extract from the state property register (owner, mortgage, seizure)", where: "State Service on Property Issues / e-gov.az", document: "Register extract (çıxarış)" },
  { step: "Check the seller's identity and that they are the registered owner", where: "Notary", document: "ID card, register extract" },
  { step: "Ask whether the property is under seizure, mortgaged or in a court dispute", where: "Notary / register", document: "Certificate" },
  { step: "Check there are no unpaid utility bills", where: "Azəriqaz, Azərişıq, Azərsu", document: "Certificate of no debt" },
  { step: "Sign the sale contract before a notary and register it", where: "Notary", document: "Notarised sale contract" },
];
