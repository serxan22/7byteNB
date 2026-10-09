// Deterministic fallbacks used when the LLM is unavailable. Clearly labelled in their text.
import type { Persona } from "./score.ts";
import { HUBS } from "./hubs.ts";

const num = (s: string) => Number(s.replace(",", "."));

export function personaFallback(text: string): Persona {
  const t = text.toLocaleLowerCase("az");
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  let budget: number | null = null;
  const m = t.match(/(\d+[.,]?\d*)\s*(min|k|000)?\s*(manat|azn|₼|\$|dollar)?/);
  if (m && (m[2] || m[3])) {
    budget = num(m[1]) * (m[2] === "min" || m[2] === "k" ? 1000 : 1);
    if (m[3] === "$" || m[3] === "dollar") budget *= 1.7;
    if (budget < 1000) budget = null;
  }
  const kids = has("uşaq", "ailə", "övlad");
  const student = has("tələbə", "universitet");
  const retiree = has("təqaüd", "pensiya", "yaşlı");
  const house = has("həyət", "bağ evi", "villa");
  const land = has("torpaq", "sot");
  const shop = has("obyekt", "mağaza", "biznes");
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
    summary_az: `${text.slice(0, 70)}${text.length > 70 ? "…" : ""} (sadə qayda ilə təhlil — AI hazırda əlçatan deyil)`,
  };
}

const PHRASES: { re: RegExp; phrase: string; meaning: string; risk: "yüksək" | "orta" | "aşağı" }[] = [
  { re: /çıxarışsız|cixarissiz/i, phrase: "çıxarışsız", meaning: "Mülkiyyət hüququ dövlət reyestrində qeydiyyatda deyil. Satıcının sahib olduğu sənədlə sübut olunmur; ikiqat satış və mübahisə riski var.", risk: "yüksək" },
  { re: /kupçasız|kupcasiz/i, phrase: "kupçasız", meaning: "Mülkiyyət sənədi (kupça/çıxarış) yoxdur. Ev üzərində hüququnuz yalnız satıcı ilə müqaviləyə əsaslanacaq.", risk: "yüksək" },
  { re: /kupça hazırlanır|kupca hazirlanir|sənəd sonra/i, phrase: "kupça hazırlanır", meaning: "Sənəd hələ yoxdur; tikinti qeydiyyatdan keçməyə bilər. Nə vaxt hazır olacağına zəmanət yoxdur.", risk: "yüksək" },
  { re: /müqavilə ilə|muqavile ile/i, phrase: "müqavilə ilə", meaning: "Satış notarial qaydada qeydiyyata alınmayan sadə müqavilə ilə aparılır; hüquqi qorunma zəifdir.", risk: "orta" },
  { re: /etibarnamə ilə|etibarname ile/i, phrase: "etibarnamə ilə", meaning: "Satıcı mülkiyyətçi deyil, etibarnamə ilə hərəkət edir. Etibarnamə ləğv oluna və ya saxta ola bilər.", risk: "yüksək" },
  { re: /ipotekaya yararsız|ipotekaya yararsiz|kreditə yararsız/i, phrase: "ipotekaya yararsız", meaning: "Banklar bu əmlakı girov kimi qəbul etmir — adətən sənəd və ya tikinti statusu ilə bağlı problem var.", risk: "orta" },
  { re: /yarımçıq tikili|yarimciq tikili|tikili davam edir/i, phrase: "yarımçıq tikili", meaning: "Bina tamamlanmayıb; tikintinin dayanması və istismara qəbul edilməməsi riski var.", risk: "yüksək" },
  { re: /qeydiyyatsız|qeydiyyatsiz/i, phrase: "qeydiyyatsız", meaning: "Əmlak və ya tikinti rəsmi qeydiyyatda deyil.", risk: "yüksək" },
];

export function legalDetect(text: string) {
  return PHRASES.filter((p) => p.re.test(text)).map(({ phrase, meaning, risk }) => ({ phrase, meaning, risk }));
}

export const LEGAL_CHECKLIST = [
  { step: "Daşınmaz əmlakın dövlət reyestrindən çıxarışı yoxla (mülkiyyətçi, girov, həbs)", where: "Əmlak Məsələləri Dövlət Xidməti / e-gov.az", document: "Reyestrdən çıxarış" },
  { step: "Satıcının şəxsiyyətini və mülkiyyətçi ilə eyni olduğunu yoxla", where: "Notarius", document: "Şəxsiyyət vəsiqəsi, çıxarış" },
  { step: "Əmlak üzərində həbs, girov və ya məhkəmə mübahisəsi olmadığını soruş", where: "Notarius / reyestr", document: "Arayış" },
  { step: "Kommunal borcların olmadığını yoxla", where: "Azəriqaz, Azərişıq, Azərsu", document: "Borc arayışı" },
  { step: "Alqı-satqı müqaviləsini notarial qaydada bağla və qeydiyyata ver", where: "Notarius", document: "Notarial alqı-satqı müqaviləsi" },
];
