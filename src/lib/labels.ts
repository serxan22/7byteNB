// Mahalle labels are built from official place/metro/street names (kept as-is in every language);
// only the generic Azerbaijani suffixes are translated.
export function localizeLabel(label: string, locale: string): string {
  if (locale !== "en") return label;
  return label.replace(/ m\. ətrafı/g, " metro area").replace(/ yaxınlığı/g, " area");
}

// Price source strings are stored in Azerbaijani in the data; publisher names stay as-is.
const SOURCE_EN: [RegExp, string][] = [
  [/^Demo dəyər$/, "Demo value"],
  [/bina\.az elanlarının medianı \(istifadəçi datasetı, (.+)\)/, "Median of bina.az listings (user-supplied dataset, $1)"],
  [/Cyril Jarnias bloqu \((yeni kompleks|sovet dövrü|kollektiv bina) ([\d–]+) USD\/m²; ilkin mənbə göstərilməyib; USD aralığının ortası ×([\d.]+)\)/, "Cyril Jarnias blog ($1 $2 USD/m²; primary source not given; midpoint of USD range ×$3)"],
  [/JAM News \/ Qiymətləndiricilər Palatası \(yeni tikili, median, (.+)\)/, "JAM News / Chamber of Appraisers (new build, median, $1)"],
  [/JAM News \/ Qiymətləndiricilər Palatası \(təkrar bazar, median, (.+)\)/, "JAM News / Chamber of Appraisers (resale, median, $1)"],
  [/Caliber\.az \(bütün yaşayış, orta, (.+)\)/, "Caliber.az (all residential, average, $1)"],
];
const KIND_EN: Record<string, string> = { "yeni kompleks": "new complex", "sovet dövrü": "Soviet-era", "kollektiv bina": "apartment block" };
export function localizeSource(source: string, locale: string): string {
  if (locale !== "en" || !source) return source;
  for (const [re, out] of SOURCE_EN) if (re.test(source)) return source.replace(re, out).replace(/\((yeni kompleks|sovet dövrü|kollektiv bina)/, (_, k) => `(${KIND_EN[k]}`);
  return source;
}
