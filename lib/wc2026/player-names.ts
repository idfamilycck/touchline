// lib/wc2026/player-names.ts
//
// Korean-name overlay for WC2026 player display. data/wc2026/matches.json
// stores ESPN's romanized spelling (e.g. "Son Heung-Min"), which is the only
// form fed into register.ts/makeVirtualPlayer. Since the audience is Korean,
// every surface that renders a Player.name (squad list, pitch labels, moment
// cards, share card) should show the Korean spelling when we have one.
//
// Pure lookup, no I/O: koreanName(romanized) returns the Korean spelling if
// known, or undefined otherwise — callers always do `koreanName(x) ?? x` so
// an unmapped name still renders (romanized fallback), never blank/crash.
//
// Two buckets, both hand-written (never derived/scraped from real attribute
// data — this only affects display strings):
//  (a) The entire KOR national team squad appearing in data/wc2026/matches.json
//      (26 distinct names, verified against the raw dataset — see the
//      "KOR squad" section below).
//  (b) ~60 globally famous non-KOR players whose Korean transliteration is
//      well established in Korean sports media.

const KOREAN_NAMES: Record<string, string> = {
  // --- KOR national team squad (all 26 distinct names found in
  // data/wc2026/matches.json lineups for teamCode "KOR") ---
  "Bae Jun-Ho": "배준호",
  "Cho Gue-Sung": "조규성",
  "Cho Wi-Je": "조위제",
  "Eom Ji-Sung": "엄지성",
  "Hwang Hee-Chan": "황희찬",
  "Hwang In-Beom": "황인범",
  "Jens Castrop": "옌스 카스트로프",
  "Jo Hyeon-Woo": "조현우",
  "Kim Jin-Gyu": "김진규",
  "Kim Min-Jae": "김민재",
  "Kim Moon-Hwan": "김문환",
  "Kim Seung-Gyu": "김승규",
  "Kim Tae-Hyeon": "김태현",
  "Lee Dong-Gyeong": "이동경",
  "Lee Gi-Hyuk": "이기혁",
  "Lee Han-Beom": "이한범",
  "Lee Jae-Sung": "이재성",
  "Lee Kang-In": "이강인",
  "Lee Tae-Seok": "이태석",
  "Oh Hyeon-Gyu": "오현규",
  "Paik Seung-Ho": "백승호",
  "Park Jin-Seop": "박진섭",
  "Seol Young-Woo": "설영우",
  "Son Heung-Min": "손흥민",
  "Song Bum-Keun": "송범근",
  "Yang Hyun-Jun": "양현준",

  // --- Globally famous players (other nations), well-established Korean
  // transliteration in Korean sports media ---
  "Lionel Messi": "리오넬 메시",
  "Kylian Mbappé": "킬리안 음바페",
  "Vinícius Júnior": "비니시우스 주니오르",
  "Jude Bellingham": "주드 벨링엄",
  "Harry Kane": "해리 케인",
  "Erling Haaland": "엘링 홀란",
  "Cristiano Ronaldo": "크리스티아누 호날두",
  "Pedri": "페드리",
  "Lamine Yamal": "라민 야말",
  "Rodri": "로드리",
  "Neymar": "네이마르",
  "Kevin De Bruyne": "케빈 더 브라위너",
  "Rodrygo": "호드리구",
  "Casemiro": "카세미루",
  "Alisson Becker": "알리송 베케르",
  "Thibaut Courtois": "티보 쿠르투아",
  "Antoine Griezmann": "앙투안 그리즈만",
  "Ousmane Dembélé": "우스만 뎀벨레",
  "Achraf Hakimi": "아슈라프 하키미",
  "Robert Lewandowski": "로베르트 레반도프스키",
  "Jamal Musiala": "자말 무시알라",
  "Florian Wirtz": "플로리안 비르츠",
  "Manuel Neuer": "마누엘 노이어",
  "Declan Rice": "데클란 라이스",
  "Phil Foden": "필 포든",
  "Marcus Rashford": "마커스 래시포드",
  "Bukayo Saka": "부카요 사카",
  "Cole Palmer": "콜 파머",
  "John Stones": "존 스톤스",
  "Virgil van Dijk": "비르힐 반 다이크",
  "Memphis Depay": "멤피스 데파이",
  "Frenkie de Jong": "프렌키 더 용",
  "Xavi Simons": "사비 시몬스",
  "Cody Gakpo": "코디 학포",
  "Luka Modric": "루카 모드리치",
  "Nico Williams": "니코 윌리엄스",
  "Dani Olmo": "다니 올모",
  "Mikel Merino": "미켈 메리노",
  "Federico Valverde": "페데리코 발베르데",
  "Julián Álvarez": "훌리안 알바레스",
  "Lautaro Martínez": "라우타로 마르티네스",
  "Enzo Fernández": "엔소 페르난데스",
  "Emiliano Martínez": "에밀리아노 마르티네스",
  "Rodrigo De Paul": "로드리고 데 파울",
  "Lisandro Martínez": "리산드로 마르티네스",
  "Sadio Mané": "사디오 마네",
  "Mohamed Salah": "모하메드 살라",
  "Victor Osimhen": "빅토르 오시멘",
  "Kaoru Mitoma": "미토마 카오루",
  "Takefusa Kubo": "쿠보 다케후사",
  "Wataru Endo": "엔도 와타루",
  "Christian Pulisic": "크리스티안 풀리식",
  "Weston McKennie": "웨스턴 매케니",
  "Tyler Adams": "타일러 아담스",
  "Giovanni Reyna": "지오반니 레이나",
  "Timothy Weah": "티모시 웨아",
  "Alphonso Davies": "알폰소 데이비스",
  "Jonathan David": "조나단 데이비드",
  "Romelu Lukaku": "로멜루 루카쿠",
  "João Cancelo": "주앙 칸셀루",
  "Bruno Fernandes": "브루누 페르난데스",
  "Bernardo Silva": "베르나르두 실바",
  "Rúben Dias": "후벤 디아스",
  "Rafael Leão": "하파엘 레앙",
  "Ilkay Gündogan": "일카이 귄도안",
  "Joshua Kimmich": "요주아 키미히",
  "Antonio Rüdiger": "안토니오 뤼디거",
  "Kai Havertz": "카이 하베르츠",
};

/**
 * Returns the Korean spelling of a romanized player name, or undefined if
 * unmapped. Callers should always fall back to the romanized input:
 *   koreanName(name) ?? name
 */
export function koreanName(romanized: string): string | undefined {
  return KOREAN_NAMES[romanized];
}
