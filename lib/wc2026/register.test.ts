import { describe, it, expect, beforeAll } from "vitest";
import { registerWc2026 } from "@/lib/wc2026/register";
import { playersOf } from "@/lib/data/players";
import { teamById } from "@/lib/data/teams";
import { venueById } from "@/lib/data/venues";
import { wc2026VenueId } from "@/lib/wc2026/venues";

beforeAll(() => registerWc2026());

describe("wc2026 등록", () => {
  it("등록 후 wc 팀 조회 가능", () => {
    expect(teamById("wc_esp")?.code).toBe("ESP");
  });
  it("wc 팀 선수 명단이 11명 이상", () => {
    expect(playersOf("wc_esp").length).toBeGreaterThanOrEqual(11);
  });
  it("기존 자유 모드 팀은 그대로 유지", () => {
    expect(teamById("kor")?.nameKo).toBe("대한민국");
    expect(playersOf("kor").length).toBe(20);
  });
  it("registerWc2026 중복 호출해도 선수 수 불변(idempotent)", () => {
    const n = playersOf("wc_esp").length;
    registerWc2026();
    expect(playersOf("wc_esp").length).toBe(n);
  });

  it("멕시코시티 경기장(Estadio Banorte)이 고도 1500m 초과로 등록된다", () => {
    const id = wc2026VenueId("Estadio Banorte");
    expect(id).not.toBe("wc_default");
    const venue = venueById(id);
    expect(venue).toBeDefined();
    expect(venue!.altitude).toBeGreaterThan(1500);
  });

  it("데이터에 존재하는 16개 경기장이 모두 등록되고 wc_default로 폴백하지 않는다", () => {
    const stadiumNames = [
      "AT&T Stadium",
      "BC Place",
      "BMO Field",
      "Estadio Akron",
      "Estadio BBVA",
      "Estadio Banorte",
      "GEHA Field at Arrowhead Stadium",
      "Gillette Stadium",
      "Hard Rock Stadium",
      "Levi's Stadium",
      "Lincoln Financial Field",
      "Lumen Field",
      "Mercedes-Benz Stadium",
      "MetLife Stadium",
      "NRG Stadium",
      "SoFi Stadium",
    ];
    for (const name of stadiumNames) {
      const id = wc2026VenueId(name);
      expect(id, `${name} -> ${id}`).not.toBe("wc_default");
      expect(venueById(id)).toBeDefined();
    }
  });

  it("매핑되지 않은 경기장명은 wc_default로 안전하게 폴백한다", () => {
    expect(wc2026VenueId("Unknown Stadium Name")).toBe("wc_default");
  });
});
