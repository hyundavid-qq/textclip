// background.js - 드래그한 텍스트만으로 모든 정보 추출
importScripts('db.js', 'lite-analyzer.js');

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-news-clip",
    title: "TextClip에 저장",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-news-clip" || !info.selectionText) return;

  try {
    const selectedText = info.selectionText.trim();
    const { title, date, body } = parseSelection(selectedText, tab);

    // 휴리스틱 분석 (요약 + 키워드)
    const analyzed = liteAnalyze({ title, body, content: '' });

    const clip = {
      title,
      date,
      body,
      summary: analyzed.summary,
      summarySource: "",
      keywords: analyzed.keywords,
      url: tab.url || "",
      savedAt: new Date().toISOString(),
    };

    const clipId = await addClip(clip);
    console.log("[TextClip] ✅ 저장 완료, id:", clipId);

    notify(
      "✅ 저장 완료",
      `${title.slice(0, 50)} — 클릭해서 보관함 열기`,
      "open-viewer"
    );
  } catch (e) {
    console.error("[TextClip] ❌ 저장 실패:", e);
    notify("❌ 저장 실패", e.message || "알 수 없는 오류");
  }
});

// ============================================================
// 드래그한 텍스트에서 제목 / 날짜 / 본문 파싱
// ============================================================
function parseSelection(text, tab) {
  // 본문은 드래그한 텍스트 그대로 (정리만)
  const body = text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 제목: 첫 번째 의미있는 줄 (10-150자, 문장 종결부호 없음)
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  let title = '';
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    const line = lines[i];
    if (line.length < 10 || line.length > 150) continue;
    // 문장 끝 부호로 끝나면 본문 문장 → 패스
    if (/[.!?](?:\s|$)/.test(line)) continue;
    title = line;
    break;
  }
  if (!title) title = tab.title || "(제목 없음)";

  // 날짜: 본문 앞부분(첫 1500자)에서 날짜 패턴 찾기
  const head = body.slice(0, 1500);
  const date = findDate(head) || new Date().toISOString().split('T')[0];

  return { title, date, body };
}

function findDate(text) {
  // 한국어 텍스트에서 흔한 날짜 패턴들
  const patterns = [
    /(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/,    // 2026.04.21, 2026-04-21, 2026년 4월 21일
    /(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const y = m[1], mo = m[2].padStart(2, '0'), d = m[3].padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
  }
  return null;
}

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === "open-viewer") {
    chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    chrome.notifications.clear(notifId);
  }
});

function notify(title, message, id) {
  chrome.notifications.create(id || ("clip-" + Date.now()), {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getCount") {
    getCount().then(c => sendResponse({ count: c })).catch(() => sendResponse({ count: 0 }));
    return true;
  }
});
