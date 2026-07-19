// sessionStorage 모킹은 스토어 모듈을 import하기 "전에" 전역에 설치해야 한다 —
// lib/store.ts는 모듈 최상단에서 persist(create(...))를 호출하므로, storage
// getter(typeof sessionStorage 체크)가 평가되는 시점에 이미 globalThis.sessionStorage가
// 있어야 persist가 실제 스토리지를 붙잡는다. vitest 환경은 "node"라 기본적으로
// window/sessionStorage가 전혀 없으므로 최소 in-memory Storage 스텁을 직접 만든다.
// vitest 자체는 정적 import로 가져와도 무방하다(store.ts를 참조하지 않으므로 순서
// 문제가 없다) — "./store"만 동적 import로 지연시켜 스텁 설치 이후에 평가되게 한다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { playersOf } from "@/lib/data/players";
import { recommend } from "@/lib/engine/recommend";
import { winProbability } from "@/lib/engine/winprob";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026Matches, wc2026MatchById } from "@/lib/wc2026/data";
import { extractMoments } from "@/lib/wc2026/moments";

// runShootout이 실제로 어떤 me/opp 레퍼런스를 simulateShootout에 넘기는지 직접 검증하기
// 위해 spy로 감싼다(vi.fn(actual)는 실구현을 그대로 호출하면서 호출 인자를 기록한다).
// 순수 결과값 동등성 비교(toEqual)만으로는 이 버그를 못 잡을 수 있다 — 예를 들어
// GK 교체가 상대 키커의 성공확률에만 영향을 주는데, 특정 시드/난수 스트림에서는 그
// 확률 차이가 우연히 어떤 킥의 성패도 뒤집지 않아 stale 로스터로 계산한 결과와
// live 로스터로 계산한 결과가 우연히 같아질 수 있기 때문이다(실제로 Date.now() 기반
// 시드로 1차 작성했을 때 버그를 되돌려도 8/8 그린이 나와 이 위험을 확인했다). 인자
// 자체를 검사하면 시드/난수와 무관하게 결정적으로 버그를 잡아낸다.
vi.mock("./engine/shootout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./engine/shootout")>();
  return { ...actual, simulateShootout: vi.fn(actual.simulateShootout) };
});

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const sessionStorageStub = new MemoryStorage();
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = sessionStorageStub;

const { useAppStore } = await import("./store");
// vi.mocked()는 vi.mock 팩토리가 이미 만들어둔 vi.fn 런타임 객체를 그대로 두고
// 타입만 Mock<...>로 캐스팅한다(동적 import의 정적 타입은 실제 함수 시그니처라
// .mock/.mockClear가 안 보이므로 필요).
const simulateShootoutMock = vi.mocked((await import("./engine/shootout")).simulateShootout);

// 헬퍼: wc2026Matches()를 순회해 원정팀(away) 관점으로 concede 순간이 존재하는 첫
// 경기의 id를 반환한다 (lib/engine/rewrite.test.ts의 pickMatchWithConcede()와 동일한
// 패턴 — startRewrite는 임의의 side/moment로 호출 가능하므로 실점 경기 하나면 충분).
function firstConcedeMatchId(): string {
  for (const m of wc2026Matches()) {
    const moments = extractMoments(m, m.away);
    if (moments.some((d) => d.kind === "concede")) return m.id;
  }
  throw new Error("no match with a concede moment found");
}

describe("store", () => {
  beforeEach(() => {
    sessionStorageStub.clear();
    useAppStore.getState().reset();
    simulateShootoutMock.mockClear();
  });

  it("startQuick 후 me/opp 라인업 11개 채워짐", () => {
    useAppStore.getState().startQuick();
    const { me, opp, setup } = useAppStore.getState();
    expect(setup.myTeamId).toBe("kor");
    expect(setup.oppTeamId).toBe("bra");
    expect(setup.venueId).toBe("metlife");
    expect(me).toBeDefined();
    expect(opp).toBeDefined();
    expect(Object.keys(me!.lineup)).toHaveLength(11);
    expect(Object.keys(opp!.lineup)).toHaveLength(11);
    expect(new Set(Object.values(me!.lineup)).size).toBe(11); // 중복 배치 없음
  });

  it("movePlayer로 배치된 슬롯 선수 교환", () => {
    useAppStore.getState().startQuick();
    const before = useAppStore.getState().me!;
    const wgLId = before.lineup["wg_l"];
    const wgRId = before.lineup["wg_r"];
    expect(wgLId).not.toBe(wgRId);

    useAppStore.getState().movePlayer("wg_l", wgRId);

    const after = useAppStore.getState().me!;
    expect(after.lineup["wg_l"]).toBe(wgRId);
    expect(after.lineup["wg_r"]).toBe(wgLId); // 스왑 확인
    expect(Object.keys(after.lineup)).toHaveLength(11);
    expect(new Set(Object.values(after.lineup)).size).toBe(11);
  });

  it("setInstructions(formation 변경) 시 라인업 재배치", () => {
    useAppStore.getState().startQuick();
    const before = useAppStore.getState().me!;
    expect(before.instructions.formation).toBe("4-3-3");
    expect(Object.keys(before.lineup).sort()).toEqual(
      ["cb1", "cb2", "cm_l", "cm_r", "dm", "fb_l", "fb_r", "gk", "st", "wg_l", "wg_r"].sort()
    );

    useAppStore.getState().setInstructions({ formation: "4-4-2" });

    const after = useAppStore.getState().me!;
    expect(after.instructions.formation).toBe("4-4-2");
    expect(Object.keys(after.lineup).sort()).toEqual(
      ["cb1", "cb2", "cm_l", "cm_r", "fb_l", "fb_r", "gk", "st1", "st2", "wg_l", "wg_r"].sort()
    );
    expect(Object.keys(after.lineup)).toHaveLength(11);
    // 포메이션 외 다른 지시사항은 보존되어야 함
    expect(after.instructions.pressing).toBe(before.instructions.pressing);
    expect(after.instructions.tempo).toBe(before.instructions.tempo);
  });

  it("persist: 스토어 조작 후 sessionStorage 'touchline-v2'에 상태 존재", () => {
    useAppStore.getState().startQuick();
    const raw = sessionStorageStub.getItem("touchline-v2");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.setup.myTeamId).toBe("kor");
    expect(parsed.state.me).toBeDefined();
  });

  it("startRewrite: rewrite 모드 진입 + match 초기화", () => {
    registerWc2026();
    const id = firstConcedeMatchId();
    const { startRewrite } = useAppStore.getState();
    const side = wc2026MatchById(id)!.away;
    const moment = extractMoments(wc2026MatchById(id)!, side)[0];
    startRewrite(id, side, moment.id);
    const s = useAppStore.getState();
    expect(s.mode).toBe("rewrite");
    expect(s.match?.minute).toBe(moment.takeoverMinute);
    expect(s.me?.teamId).toBe(`wc_${side.toLowerCase()}`);
    expect(s.rewriteContext).toEqual({
      matchId: id,
      side,
      momentId: moment.id,
      takeoverMinute: moment.takeoverMinute,
    });
  });

  it("persist name이 touchline-v2 (startRewrite 후에도 v2 키에 저장)", () => {
    registerWc2026();
    const id = firstConcedeMatchId();
    const side = wc2026MatchById(id)!.away;
    const moment = extractMoments(wc2026MatchById(id)!, side)[0];
    useAppStore.getState().startRewrite(id, side, moment.id);

    const raw = sessionStorageStub.getItem("touchline-v2");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.mode).toBe("rewrite");
    expect(parsed.state.rewriteContext.matchId).toBe(id);
    // v1 키는 더 이상 쓰이지 않는다
    expect(sessionStorageStub.getItem("touchline-v1")).toBeNull();
  });

  it("startQuick/selectMatchup/reset은 mode를 free로 되돌리고 rewriteContext를 비운다", () => {
    registerWc2026();
    const id = firstConcedeMatchId();
    const side = wc2026MatchById(id)!.away;
    const moment = extractMoments(wc2026MatchById(id)!, side)[0];
    useAppStore.getState().startRewrite(id, side, moment.id);
    expect(useAppStore.getState().mode).toBe("rewrite");

    useAppStore.getState().startQuick();
    expect(useAppStore.getState().mode).toBe("free");
    expect(useAppStore.getState().rewriteContext).toBeUndefined();

    useAppStore.getState().startRewrite(id, side, moment.id);
    expect(useAppStore.getState().mode).toBe("rewrite");
    useAppStore.getState().selectMatchup("kor", "jpn", "sofi");
    expect(useAppStore.getState().mode).toBe("free");
    expect(useAppStore.getState().rewriteContext).toBeUndefined();

    useAppStore.getState().startRewrite(id, side, moment.id);
    expect(useAppStore.getState().mode).toBe("rewrite");
    useAppStore.getState().reset();
    expect(useAppStore.getState().mode).toBe("free");
    expect(useAppStore.getState().rewriteContext).toBeUndefined();
  });

  it("rewrite 모드에서 beginMatch는 takeoverMinute을 보존하고 편집된 me를 match에 반영한다", () => {
    registerWc2026();
    const id = firstConcedeMatchId();
    const side = wc2026MatchById(id)!.away;
    const moment = extractMoments(wc2026MatchById(id)!, side)[0];
    useAppStore.getState().startRewrite(id, side, moment.id);

    const takeoverMinute = useAppStore.getState().rewriteContext!.takeoverMinute;
    const takeoverScoreMe = useAppStore.getState().match!.scoreMe;
    const takeoverScoreOpp = useAppStore.getState().match!.scoreOpp;
    expect(useAppStore.getState().match!.minute).toBe(takeoverMinute);

    // 작전실에서 지시사항을 편집(예: 프레싱 강도 변경)한다.
    const editedPressing = useAppStore.getState().me!.instructions.pressing === 3 ? 1 : 3;
    useAppStore.getState().setInstructions({ pressing: editedPressing });
    expect(useAppStore.getState().me!.instructions.pressing).toBe(editedPressing);

    useAppStore.getState().beginMatch();

    const s = useAppStore.getState();
    // beginMatch가 initMatch(0분 재시작)를 호출하지 않았다면 minute/score가 그대로다.
    expect(s.match!.minute).toBe(takeoverMinute);
    expect(s.match!.scoreMe).toBe(takeoverScoreMe);
    expect(s.match!.scoreOpp).toBe(takeoverScoreOpp);
    // 편집한 지시사항이 match.me에 반영됐다.
    expect(s.match!.me.instructions.pressing).toBe(editedPressing);
  });

  it("beginMatch가 경기를 초기화하고 tickMinute이 분/probTimeline을 진행시킨다", () => {
    useAppStore.getState().startQuick();
    useAppStore.getState().beginMatch();
    let s = useAppStore.getState();
    expect(s.match).toBeDefined();
    expect(s.match!.minute).toBe(0);
    expect(s.match!.finished).toBe(false);
    expect(s.match!.probTimeline).toHaveLength(1);

    useAppStore.getState().tickMinute();
    s = useAppStore.getState();
    expect(s.match!.minute).toBe(1);
    expect(s.match!.probTimeline).toHaveLength(2);
    expect(s.match!.probTimeline[1].minute).toBe(1);
  });

  it("intervene로 교체 시 match.me.lineup/subsUsedMe/개입 이력이 현재 분으로 반영된다", () => {
    useAppStore.getState().startQuick();
    useAppStore.getState().beginMatch();
    useAppStore.getState().tickMinute(); // minute 1

    let s = useAppStore.getState();
    const outId = s.match!.me.lineup["st"];
    const onPitch = new Set(Object.values(s.match!.me.lineup));
    const benchId = playersOf("kor")
      .map((p) => p.id)
      .find((id) => !onPitch.has(id))!;

    useAppStore.getState().intervene({ side: "me", subs: [{ out: outId, in: benchId }] });

    s = useAppStore.getState();
    expect(Object.values(s.match!.me.lineup)).toContain(benchId);
    expect(s.match!.subsUsedMe).toBe(1);
    expect(s.match!.interventions).toHaveLength(1);
    expect(s.match!.interventions[0].minute).toBe(1); // intervene 호출 당시 match.minute
  });

  it("setRole/setSpecial이 me에 반영된다", () => {
    useAppStore.getState().startQuick();

    useAppStore.getState().setRole("st", "st_target");
    let s = useAppStore.getState();
    expect(s.me!.roles["st"]).toBe("st_target");

    useAppStore.getState().setSpecial({ captainId: s.me!.lineup["gk"] });
    s = useAppStore.getState();
    expect(s.me!.special.captainId).toBe(s.me!.lineup["gk"]);
    expect(s.me!.special.ckBigMenForward).toBe(false); // 기존 필드 보존(부분 병합 확인)
  });

  it("applyRecommendation이 추천 instructions/lineup/roles를 일괄 반영하고 승률이 나빠지지 않는다", () => {
    useAppStore.getState().startQuick();
    const { me, opp, setup } = useAppStore.getState();
    const before = winProbability(me!, opp!, setup.venueId!).win;

    const rec = recommend(me!, opp!, setup.venueId!);
    useAppStore.getState().applyRecommendation(rec);

    const after = useAppStore.getState().me!;
    // 추천 결과가 그대로 me에 반영됨
    expect(after.instructions).toEqual(rec.instructions);
    expect(after.lineup).toEqual(rec.lineup);
    expect(after.roles).toEqual(rec.roles);
    // special/teamId는 보존
    expect(after.teamId).toBe(me!.teamId);
    expect(after.special).toEqual(me!.special);

    // 반영 후 승률은 최소한 이전과 같거나 더 높다(recommend는 현재 설정보다 나쁘게 추천하지 않음)
    const applied = winProbability(after, opp!, setup.venueId!).win;
    expect(applied).toBeGreaterThanOrEqual(before - 1e-9);
    expect(applied).toBeCloseTo(rec.winProb, 6);
  });

  it("rematch가 같은 매치업을 유지하고 시드를 +1 하며 match/shootout을 비운다", () => {
    useAppStore.getState().selectMatchup("kor", "jpn", "sofi");
    const before = useAppStore.getState();
    const beforeSeed = before.setup.seed;
    useAppStore.getState().beginMatch();
    expect(useAppStore.getState().match).toBeDefined();

    useAppStore.getState().rematch();
    const after = useAppStore.getState();
    expect(after.setup.myTeamId).toBe("kor");
    expect(after.setup.oppTeamId).toBe("jpn");
    expect(after.setup.venueId).toBe("sofi");
    expect(after.setup.seed).toBe(beforeSeed + 1);
    expect(after.match).toBeUndefined();
    expect(after.shootout).toBeUndefined();
    expect(Object.keys(after.me!.lineup)).toHaveLength(11);
    expect(Object.keys(after.opp!.lineup)).toHaveLength(11);
  });

  it("전체 흐름: GK 교체 후 승부차기가 라이브(post-sub) 로스터를 사용한다", () => {
    useAppStore.getState().startQuick();
    useAppStore.getState().beginMatch();
    for (let i = 0; i < 5; i++) useAppStore.getState().tickMinute();

    let s = useAppStore.getState();
    const startingGk = s.match!.me.lineup["gk"];
    expect(startingGk).toBe("kor_01"); // autoPlace가 골키퍼 능력치가 더 높은 선수를 선발
    const backupGk = "kor_02";
    expect(Object.values(s.match!.me.lineup)).not.toContain(backupGk);

    // 60분 GK 교체
    useAppStore.getState().intervene({ side: "me", subs: [{ out: startingGk, in: backupGk }] });
    s = useAppStore.getState();
    expect(s.match!.me.lineup["gk"]).toBe(backupGk);

    // 종료까지 진행
    let guard = 0;
    while (!useAppStore.getState().match!.finished && guard < 200) {
      useAppStore.getState().tickMinute();
      guard++;
    }
    s = useAppStore.getState();
    expect(s.match!.finished).toBe(true);
    expect(s.match!.me.lineup["gk"]).toBe(backupGk); // 교체가 경기 끝까지 유지됨

    const kickers = Object.values(s.match!.me.lineup)
      .filter((id) => id !== backupGk)
      .slice(0, 5);

    useAppStore.getState().runShootout(kickers);
    const afterShootout = useAppStore.getState();
    expect(afterShootout.shootout).toBeDefined();

    // top-level me는 여전히 킥오프 스냅샷(교체 전 GK)이다 — 버그의 전제 조건 자체를
    // 증명한다: 만약 runShootout이 이 stale 객체를 썼다면 아래 spy 검증이 실패한다.
    expect(afterShootout.me!.lineup["gk"]).toBe(startingGk);

    // 버그 회귀의 결정적 증거: simulateShootout에 실제로 전달된 인자를 직접 검사한다
    // (결과값 동등성 비교는 시드에 따라 우연히 일치할 수 있어 신뢰할 수 없다 — 위
    // vi.mock 주석 참고). me 인자는 match.me(라이브, GK=backupGk)와 deep-equal이어야
    // 하고, stale top-level me(GK=startingGk)와는 달라야 한다.
    expect(simulateShootoutMock).toHaveBeenCalledTimes(1);
    const [kickersArg, meArg, oppArg, seedArg] = simulateShootoutMock.mock.calls[0];
    expect(kickersArg).toEqual(kickers);
    expect(meArg).toEqual(s.match!.me);
    expect(meArg.lineup["gk"]).toBe(backupGk); // 라이브 로스터 확인
    expect(meArg.lineup["gk"]).not.toBe(startingGk); // stale 로스터가 아님을 확인
    expect(oppArg).toEqual(s.match!.opp);
    expect(seedArg).toBe(afterShootout.setup.seed);
  });
});
