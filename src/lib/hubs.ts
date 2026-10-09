// Fixed list of work hubs. Coordinates are never invented: they are the centroids of these regions in public/data.
export const HUBS: Record<string, string> = {
  "bk-nesimi": "Nəsimi (Bakı mərkəzi)",
  "bk-sebail": "Səbail (İçərişəhər, bulvar)",
  "bk-yasamal": "Yasamal",
  "bk-nerimanov": "Nərimanov",
  "bk-nizami": "Nizami",
  "bk-xetai": "Xətai (Ağ şəhər)",
  "bk-bineqedi": "Binəqədi",
  "bk-xezer": "Xəzər",
  "bk-sabuncu": "Sabunçu",
  "bk-suraxani": "Suraxanı",
  "bk-qaradag": "Qaradağ",
  "bk-pirallahi": "Pirallahı",
  "az-sumqayit": "Sumqayıt",
  "az-gence": "Gəncə",
  "az-mingecevir": "Mingəçevir",
};
export const HUB_IDS = Object.keys(HUBS);
