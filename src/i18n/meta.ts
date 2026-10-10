// hreflang alternates for every page: az (unprefixed), en (/en/…), x-default = az
export function alternates(path: string, locale: string) {
  const en = path === "/" ? "/en" : `/en${path}`;
  return { canonical: locale === "en" ? en : path, languages: { az: path, en, "x-default": path } };
}
