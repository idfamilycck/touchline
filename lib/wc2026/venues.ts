// lib/wc2026/venues.ts
//
// Per-stadium Venue profiles for the 16 distinct World Cup 2026 stadiums
// present in data/wc2026/matches.json (field `venueKo`, currently the raw
// ESPN English stadium name — the field is renamed in spirit only; the
// actual Korean display name comes from the registered Venue, resolved via
// venueIdForStadium()/wc2026VenueId() below). Real-world altitude/climate/
// dome values so the engine's altitude (>1500m) and heat (>=30C, no dome)
// stamina modifiers — the product's headline "environment" feature — are
// actually exercised in WC2026 rewrite mode instead of always hitting the
// single flat wc_default fallback.
//
// Values are researched real-world figures for the actual 16 host stadiums
// (elevation, climate-controlled/dome status, capacity). Where a precise
// figure wasn't confidently known, a sensible same-city estimate is used
// (noted inline) — never a wild guess.

import type { Venue } from "@/lib/types";

export interface StadiumVenue extends Venue {
  // The exact `venueKo` string as it appears in data/wc2026/matches.json
  // (English ESPN stadium name) that this Venue profile maps to.
  matchesStadiumName: string;
}

export const WC_STADIUM_VENUES: StadiumVenue[] = [
  {
    id: "wc_venue_estadio-banorte",
    matchesStadiumName: "Estadio Banorte",
    // Mexico City (formerly/commercially "Estadio Azteca"; renamed via
    // Grupo Banorte naming-rights deal). High-altitude showcase venue.
    nameKo: "에스타디오 바노르테",
    cityKo: "멕시코시티",
    altitude: 2240,
    avgTempC: 18,
    dome: false,
    capacity: 87523,
  },
  {
    id: "wc_venue_estadio-akron",
    matchesStadiumName: "Estadio Akron",
    nameKo: "에스타디오 아크론",
    cityKo: "과달라하라",
    altitude: 1566,
    avgTempC: 24,
    dome: false,
    capacity: 48071,
  },
  {
    id: "wc_venue_estadio-bbva",
    matchesStadiumName: "Estadio BBVA",
    nameKo: "에스타디오 BBVA",
    cityKo: "몬테레이",
    altitude: 540,
    avgTempC: 30,
    dome: false,
    capacity: 53500,
  },
  {
    id: "wc_venue_att-stadium",
    matchesStadiumName: "AT&T Stadium",
    nameKo: "AT&T 스타디움",
    cityKo: "댈러스",
    altitude: 190,
    avgTempC: 24,
    dome: true, // retractable roof, typically closed for match-day climate control
    capacity: 80000,
  },
  {
    id: "wc_venue_mercedes-benz",
    matchesStadiumName: "Mercedes-Benz Stadium",
    nameKo: "메르세데스벤츠 스타디움",
    cityKo: "애틀랜타",
    altitude: 320,
    avgTempC: 24,
    dome: true, // retractable roof
    capacity: 71000,
  },
  {
    id: "wc_venue_nrg-stadium",
    matchesStadiumName: "NRG Stadium",
    nameKo: "NRG 스타디움",
    cityKo: "휴스턴",
    altitude: 13,
    avgTempC: 25,
    dome: true, // retractable roof, humid climate usually played closed
    capacity: 72220,
  },
  {
    id: "wc_venue_bc-place",
    matchesStadiumName: "BC Place",
    nameKo: "BC 플레이스",
    cityKo: "밴쿠버",
    altitude: 60,
    avgTempC: 18,
    dome: true, // retractable roof
    capacity: 54500,
  },
  {
    id: "wc_venue_sofi",
    matchesStadiumName: "SoFi Stadium",
    nameKo: "소파이 스타디움",
    cityKo: "로스앤젤레스",
    altitude: 30,
    avgTempC: 23,
    dome: true, // fixed translucent canopy, effectively enclosed
    capacity: 70000,
  },
  {
    id: "wc_venue_bmo-field",
    matchesStadiumName: "BMO Field",
    nameKo: "BMO 필드",
    cityKo: "토론토",
    altitude: 76,
    avgTempC: 22,
    dome: false,
    capacity: 45736,
  },
  {
    id: "wc_venue_lumen-field",
    matchesStadiumName: "Lumen Field",
    nameKo: "루멘 필드",
    cityKo: "시애틀",
    altitude: 50,
    avgTempC: 19,
    dome: false, // open-air (partial roof does not enclose the field)
    capacity: 68740,
  },
  {
    id: "wc_venue_levis-stadium",
    matchesStadiumName: "Levi's Stadium",
    nameKo: "리바이스 스타디움",
    cityKo: "샌프란시스코베이",
    altitude: 8,
    avgTempC: 21,
    dome: false,
    capacity: 68500,
  },
  {
    id: "wc_venue_arrowhead",
    matchesStadiumName: "GEHA Field at Arrowhead Stadium",
    nameKo: "애로우헤드 스타디움",
    cityKo: "캔자스시티",
    altitude: 281,
    avgTempC: 26,
    dome: false,
    capacity: 76416,
  },
  {
    id: "wc_venue_gillette",
    matchesStadiumName: "Gillette Stadium",
    nameKo: "질레트 스타디움",
    cityKo: "보스턴",
    altitude: 46,
    avgTempC: 22,
    dome: false,
    capacity: 65878,
  },
  {
    id: "wc_venue_hard-rock",
    matchesStadiumName: "Hard Rock Stadium",
    nameKo: "하드록 스타디움",
    cityKo: "마이애미",
    altitude: 2,
    avgTempC: 29,
    dome: false,
    capacity: 65326,
  },
  {
    id: "wc_venue_lincoln-financial",
    matchesStadiumName: "Lincoln Financial Field",
    nameKo: "링컨 파이낸셜 필드",
    cityKo: "필라델피아",
    altitude: 12,
    avgTempC: 23,
    dome: false,
    capacity: 69796,
  },
  {
    id: "wc_venue_metlife",
    matchesStadiumName: "MetLife Stadium",
    nameKo: "메트라이프 스타디움",
    cityKo: "뉴욕/뉴저지",
    altitude: 7,
    avgTempC: 23,
    dome: false,
    capacity: 82500,
  },
];

const idByStadiumName = new Map(WC_STADIUM_VENUES.map((v) => [v.matchesStadiumName, v.id]));

// Maps a raw `Wc2026Match.venueKo` value (ESPN English stadium name) to the
// registered engine Venue id for that stadium. Falls back to the generic
// "wc_default" venue for any stadium name not in the table above (keeps
// fromRealState safe even if the dataset ever adds an unmapped venue).
export function wc2026VenueId(matchesStadiumName: string): string {
  return idByStadiumName.get(matchesStadiumName) ?? "wc_default";
}
