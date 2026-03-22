export const FT_COLUMNS = [
  "PK interne",
  "Réseau",
  "Bloqueo",
  "V Max",
  "Sit Km",
  "Dependencia",
  "Com",
  "Hora",
  "Técn",
  "Conc",
  "Radio",
  "Ramp Caract",
  "ETCS",
] as const;

export type FTColumnKey = (typeof FT_COLUMNS)[number];