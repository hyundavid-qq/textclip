// lite-analyzer.js - 다운로드 없는 휴리스틱 기반 텍스트 분석
// background.js와 viewer.js 둘 다에서 importScripts/script로 로드 가능

// ============================================================
// 한국어 불용어 / 조사
// ============================================================
const STOPWORDS = new Set([
  // 대명사 / 지시어
  "이", "그", "저", "것", "수", "등", "및", "의", "그것", "이것", "저것",
  "어느", "어떤", "어떻게", "무엇", "누구", "여기", "거기", "어디",
  // 인칭
  "나", "너", "우리", "저희", "그들", "자기", "본인", "그녀", "그분",
  // 시간 / 빈도
  "오늘", "어제", "내일", "지금", "이번", "다음", "다시", "또", "또한",
  "최근", "현재", "당시", "이날", "이후", "이전", "지난", "올해", "작년",
  // 접속어
  "그리고", "그러나", "하지만", "따라서", "또한", "그러므로", "그래서", "한편",
  "그런데", "그러면", "더욱이", "특히", "다만",
  // 기본 동사 / 형용사
  "있다", "없다", "하다", "되다", "한다", "된다", "있는", "없는", "하는", "되는",
  "있어", "없어", "있고", "없고", "했다", "됐다", "한다는", "된다는",
  "같다", "다르다", "좋다", "나쁘다", "크다", "작다",
  "통해", "위해", "대해", "관해", "따라", "통한", "위한", "대한", "관한",
  // 수량
  "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열",
  "하나", "둘", "셋", "넷", "다섯", "모든", "각", "여러", "많은", "적은",
  // 기타 흔한 단어
  "기자", "뉴스", "기사", "보도", "사진", "사진=", "연합뉴스", "뉴시스",
  "지난해", "올해", "내년", "이번", "이날", "당시",
]);

// 조사 패턴 (단어 끝에 붙는 것들)
const PARTICLE_RE = /(은|는|이|가|을|를|에|에서|에게|로|으로|와|과|의|도|만|까지|부터|보다|이라|이라고|라고|라는|라며|이지만|지만|이며|면서|이다|입니다|이라며|에는|에도|에만|에서는|에서도)$/;

// ============================================================
// 요약: 첫 N문장
// ============================================================
function liteSummary(body, content, maxSentences = 3) {
  const text = (body && body.length > 100) ? body : (content || "");
  if (!text) return "";

  // 문장 분리: 마침표/물음표/느낌표 후 공백
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 15 && s.length <= 300);

  if (sentences.length === 0) {
    return text.slice(0, 200) + (text.length > 200 ? "…" : "");
  }

  let summary = sentences.slice(0, maxSentences).join(" ");
  // 너무 길면 자르기
  if (summary.length > 400) summary = summary.slice(0, 400) + "…";
  return summary;
}

// ============================================================
// 키워드 추출: 빈도수 + 길이 가중치
// ============================================================
function liteKeywords(title, body, content, maxKeywords = 5) {
  const text = `${title || ""} ${title || ""} ${body || ""} ${content || ""}`;
  // 제목은 가중치를 위해 두 번 포함

  // 단어 추출: 한글/영문/숫자
  const tokens = text
    .replace(/[^\w가-힣\sㄱ-ㅎ]/g, " ")
    .split(/\s+/);

  const freq = new Map();
  for (let raw of tokens) {
    if (!raw) continue;
    // 조사 제거 (한국어)
    let w = raw.replace(PARTICLE_RE, "");
    if (w.length < 2) continue;
    if (STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // 숫자만
    if (/^[a-z]$/i.test(w)) continue; // 알파벳 한 글자
    
    // 길이 가중치: 긴 단어 = 고유명사일 가능성 높음 (최대 4)
    const weight = Math.min(w.length, 4);
    freq.set(w, (freq.get(w) || 0) + weight);
  }

  // 점수 정렬, 상위 N개
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// ============================================================
// 통합 분석
// ============================================================
function liteAnalyze({ title = "", body = "", content = "" }) {
  return {
    summary: liteSummary(body, content),
    keywords: liteKeywords(title, body, content),
  };
}
