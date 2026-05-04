// viewer.js — 보관함 메인 로직

// 새 폴더 생성 시 자동 배정되는 색상 팔레트 (9개)
const FOLDER_PALETTE = [
  "#5b6b7d", // slate
  "#3a7a4a", // forest
  "#9b3a32", // brick
  "#3b62a8", // ocean
  "#a55a2a", // ember
  "#7a3a9e", // violet
  "#a4456f", // berry
  "#2a7a72", // teal
  "#5a5a5a", // gray
];

const state = {
  allClips: [],
  folders: [],
  filtered: [],
  search: "",
  folderId: null,   // null = 저장한 클립, number = 특정 폴더
  keyword: null,
  sort: "savedAt-desc",
};

const $ = (sel) => document.querySelector(sel);

async function init() {
  await refresh();

  $("#searchBox").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });
  $("#sortSelect").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });
  $("#btnExport").addEventListener("click", exportClips);
  $("#btnImport").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", importClips);
  $("#btnClearAll").addEventListener("click", confirmClearAll);
  $("#btnNewFolder").addEventListener("click", handleNewFolder);
  $("#btnSettings").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  });

  // AI 결과 입력 모달 이벤트
  document.querySelector('#aiResultModal .modal-close').addEventListener('click', closeAIResultModal);
  document.querySelector('#aiResultModal .modal-overlay').addEventListener('click', closeAIResultModal);
  document.getElementById('btnCancelAI').addEventListener('click', closeAIResultModal);
  document.getElementById('btnSaveAISummary').addEventListener('click', async () => {
    if (!currentClipForAI) return;
    const summary = document.getElementById('aiResponseInput').value.trim();
    if (!summary) { showToast("⚠️ 요약 내용을 입력하세요"); return; }
    // 모달 열린 동안 클립이 이동·삭제됐을 수 있으니 최신 레코드 재조회
    const fresh = await getClip(currentClipForAI.id);
    if (!fresh) {
      showToast("❌ 해당 클립이 더 이상 존재하지 않습니다");
      closeAIResultModal();
      await refresh();
      return;
    }
    fresh.summary = summary;
    fresh.summarySource = "ai";
    await updateClip(fresh);
    closeAIResultModal();
    await refresh();
    showToast("✅ 요약이 저장되었습니다");
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('aiResultModal').hidden) {
      closeAIResultModal();
    }
  });
  document.getElementById('linkEditPrompts').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  });

  // 카드의 폴더 이동 메뉴(<details>) 외부 클릭 시 닫기
  document.addEventListener("click", (e) => {
    document.querySelectorAll("details.card-folder-menu[open]").forEach(d => {
      if (!d.contains(e.target)) d.open = false;
    });
  });
}

async function refresh() {
  state.allClips = await getAllClips();
  state.folders = await getAllFolders();
  renderSidebar();
  render();
}

// 구버전 호환: body 없으면 content 사용
function getBody(clip) {
  return clip.body || clip.content || "";
}

// ============================================================
// 사이드바
// ============================================================
function renderSidebar() {
  const inboxCount = state.allClips.filter(c => !c.folderId).length;
  const folderCounts = {};
  for (const f of state.folders) folderCounts[f.id] = 0;
  for (const c of state.allClips) {
    if (c.folderId && folderCounts[c.folderId] !== undefined) {
      folderCounts[c.folderId]++;
    }
  }

  const list = $("#folderList");
  list.innerHTML = "";

  // 저장한 클립 — 항상 맨 위, 액션 없음
  list.appendChild(makeFolderItem({
    id: null,
    name: "저장한 클립",
    color: null,
    count: inboxCount,
    isInbox: true,
    isActive: state.folderId === null,
  }));

  // 사용자 폴더 — 생성순 (오래된 순)
  const sorted = [...state.folders].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || "")
  );
  for (const f of sorted) {
    list.appendChild(makeFolderItem({
      id: f.id,
      name: f.name,
      color: f.color,
      count: folderCounts[f.id] || 0,
      isInbox: false,
      isActive: state.folderId === f.id,
    }));
  }

  // 키워드 클라우드
  const kwFreq = {};
  for (const clip of state.allClips) {
    for (const kw of (clip.keywords || [])) {
      const norm = kw.replace(/^#/, "").trim();
      if (!norm) continue;
      kwFreq[norm] = (kwFreq[norm] || 0) + 1;
    }
  }
  const top = Object.entries(kwFreq).sort((a, b) => b[1] - a[1]).slice(0, 20);

  const cloud = $("#keywordCloud");
  cloud.innerHTML = "";
  if (top.length === 0) {
    cloud.innerHTML = '<span style="font-size:11.5px;color:var(--text-subtle)">아직 없음</span>';
  } else {
    top.forEach(([kw, count]) => {
      const pill = document.createElement("span");
      pill.className = "kw-pill" + (state.keyword === kw ? " active" : "");
      pill.textContent = `#${kw}`;
      pill.title = `${count}개 클립`;
      pill.addEventListener("click", () => {
        state.keyword = state.keyword === kw ? null : kw;
        renderSidebar();
        render();
      });
      cloud.appendChild(pill);
    });
  }
}

function makeFolderItem({ id, name, color, count, isInbox, isActive }) {
  const li = document.createElement("li");
  li.className = "folder-item" + (isActive ? " active" : "") + (isInbox ? " folder-inbox" : "");

  if (isInbox) {
    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.textContent = "📥";
    li.appendChild(icon);
  } else if (color) {
    const dot = document.createElement("span");
    dot.className = "folder-dot";
    dot.style.background = color;
    li.appendChild(dot);
  }

  const nameEl = document.createElement("span");
  nameEl.className = "folder-name";
  nameEl.textContent = name;
  li.appendChild(nameEl);

  const countEl = document.createElement("span");
  countEl.className = "count";
  countEl.textContent = count;
  li.appendChild(countEl);

  if (!isInbox) {
    const actions = document.createElement("span");
    actions.className = "folder-actions";

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✏️";
    renameBtn.title = "이름 변경";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleRenameFolder(id, name);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "삭제";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteFolder(id, name);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(actions);
  }

  li.addEventListener("click", () => {
    state.folderId = id;
    renderSidebar();
    render();
  });

  return li;
}

// ============================================================
// 폴더 CRUD 핸들러
// ============================================================
function nextFolderColor(folders) {
  const used = new Set(folders.map(f => f.color));
  for (const c of FOLDER_PALETTE) {
    if (!used.has(c)) return c;
  }
  return FOLDER_PALETTE[folders.length % FOLDER_PALETTE.length];
}

async function handleNewFolder() {
  const raw = prompt("새 폴더 이름:");
  if (!raw) return;
  const name = raw.trim().slice(0, 50);
  if (!name) return;
  await addFolder({
    name,
    color: nextFolderColor(state.folders),
    createdAt: new Date().toISOString(),
  });
  await refresh();
}

async function handleRenameFolder(id, oldName) {
  const raw = prompt("새 이름:", oldName);
  if (raw === null) return;
  const name = raw.trim().slice(0, 50);
  if (!name || name === oldName) return;
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;
  folder.name = name;
  await updateFolder(folder);
  await refresh();
}

async function handleDeleteFolder(id, name) {
  if (!confirm(`"${name}" 폴더를 삭제할까요?\n\n폴더 안의 클립은 저장한 클립으로 이동됩니다.`)) return;
  await deleteFolder(id);
  if (state.folderId === id) state.folderId = null;
  await refresh();
}

// ============================================================
// 메인 렌더
// ============================================================
function render() {
  let arr = [...state.allClips];

  if (state.folderId === null) {
    arr = arr.filter(c => !c.folderId);
  } else {
    arr = arr.filter(c => c.folderId === state.folderId);
  }
  if (state.keyword) {
    arr = arr.filter(c =>
      (c.keywords || []).some(k => k.replace(/^#/, "").trim() === state.keyword)
    );
  }
  if (state.search) {
    const q = state.search;
    arr = arr.filter(c =>
      (c.title || "").toLowerCase().includes(q) ||
      (c.summary || "").toLowerCase().includes(q) ||
      getBody(c).toLowerCase().includes(q) ||
      (c.keywords || []).some(k => k.toLowerCase().includes(q))
    );
  }

  const [field, dir] = state.sort.split("-");
  arr.sort((a, b) => {
    const av = a[field] || "";
    const bv = b[field] || "";
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });

  state.filtered = arr;

  $("#totalCount").textContent = state.allClips.length;

  const chips = $("#activeFilters");
  chips.innerHTML = "";
  if (state.folderId !== null) {
    const folder = state.folders.find(f => f.id === state.folderId);
    if (folder) {
      chips.appendChild(makeChip(`폴더: ${folder.name}`, () => {
        state.folderId = null;
        renderSidebar();
        render();
      }));
    }
  }
  if (state.keyword) {
    chips.appendChild(makeChip(`#${state.keyword}`, () => {
      state.keyword = null;
      renderSidebar();
      render();
    }));
  }
  if (state.search) {
    chips.appendChild(makeChip(`검색: "${state.search}"`, () => {
      state.search = "";
      $("#searchBox").value = "";
      render();
    }));
  }

  $("#emptyState").hidden = state.allClips.length > 0;
  $("#noResults").hidden = !(state.allClips.length > 0 && arr.length === 0);

  const list = $("#cardList");
  list.innerHTML = "";
  for (const clip of arr) {
    list.appendChild(makeCard(clip));
  }
}

function makeChip(label, onRemove) {
  const c = document.createElement("span");
  c.className = "filter-chip";
  c.innerHTML = `${escapeHtml(label)} <span class="x">×</span>`;
  c.addEventListener("click", onRemove);
  return c;
}

// ============================================================
// 카드 렌더
// ============================================================
function makeCard(clip) {
  const t = $("#cardTemplate").content.cloneNode(true);
  const card = t.querySelector(".card");

  card.querySelector(".card-date").textContent = formatDate(clip.date);

  const safeHref = safeUrl(clip.url);
  const hasValidUrl = safeHref !== "#";

  const sourceLink = card.querySelector(".card-source");
  if (hasValidUrl) {
    sourceLink.href = safeHref;
    card.querySelector(".source-domain").textContent = getDomain(clip.url);
  } else {
    sourceLink.style.display = "none";
  }

  // 폴더 이동 메뉴
  const folderMenu = card.querySelector(".card-folder-menu");
  populateFolderMenu(folderMenu, clip);
  // source가 숨겨졌으면 folder-menu가 우측 정렬 역할 인계
  if (!hasValidUrl) folderMenu.style.marginLeft = "auto";

  const titleEl = card.querySelector(".card-title");
  if (hasValidUrl) {
    const a = document.createElement("a");
    a.href = safeHref;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = clip.title || "(제목 없음)";
    titleEl.appendChild(a);
  } else {
    titleEl.textContent = clip.title || "(제목 없음)";
  }

  const sum = card.querySelector(".card-summary");
  if (clip.summary) {
    sum.textContent = clip.summary;
    if (clip.summarySource === "ai") sum.classList.add("is-ai");
  } else {
    sum.remove();
  }

  const kwBox = card.querySelector(".card-keywords");
  for (const kw of (clip.keywords || [])) {
    const norm = kw.replace(/^#/, "").trim();
    if (!norm) continue;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = norm;
    tag.addEventListener("click", () => {
      state.keyword = norm;
      renderSidebar();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    kwBox.appendChild(tag);
  }

  const expandBtn = card.querySelector(".card-expand");
  const bodyEl = card.querySelector(".card-body");
  const fullBody = getBody(clip);
  if (fullBody && fullBody.length > 0) {
    bodyEl.textContent = fullBody;
    expandBtn.addEventListener("click", () => {
      const open = !bodyEl.hidden;
      bodyEl.hidden = open;
      expandBtn.textContent = open ? "본문 펼치기 ▾" : "본문 닫기 ▴";
    });
  } else {
    expandBtn.style.display = "none";
  }

  card.querySelector(".card-ai-summarize").addEventListener("click", () => handleAISummarize(clip));

  card.querySelector(".card-delete").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`"${(clip.title || "").slice(0, 30)}" 클립을 삭제할까요?`)) return;
    await deleteClip(clip.id);
    await refresh();
  });

  return card;
}

function populateFolderMenu(menuEl, clip) {
  const summary = menuEl.querySelector(".card-folder-summary");
  const dot = summary.querySelector(".folder-dot");
  const label = summary.querySelector(".folder-label");

  const currentFolder = clip.folderId
    ? state.folders.find(f => f.id === clip.folderId)
    : null;

  if (currentFolder) {
    dot.style.background = currentFolder.color || "#999";
    dot.style.display = "";
    label.textContent = truncate(currentFolder.name, 14);
  } else {
    dot.style.display = "none";
    label.textContent = "📥 저장한 클립";
  }

  const pop = menuEl.querySelector(".folder-menu-pop");
  pop.innerHTML = "";

  pop.appendChild(makeFolderMenuItem(null, "📥 저장한 클립", null, !clip.folderId, async () => {
    menuEl.open = false;
    if (clip.folderId) {
      await moveClipToFolder(clip.id, null);
      await refresh();
    }
  }));

  const sorted = [...state.folders].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || "")
  );
  for (const f of sorted) {
    pop.appendChild(makeFolderMenuItem(f.id, f.name, f.color, clip.folderId === f.id, async () => {
      menuEl.open = false;
      if (clip.folderId !== f.id) {
        await moveClipToFolder(clip.id, f.id);
        await refresh();
      }
    }));
  }
}

function makeFolderMenuItem(id, name, color, isCurrent, onClick) {
  const btn = document.createElement("button");
  btn.className = "folder-menu-item" + (isCurrent ? " current" : "");
  btn.type = "button";

  if (color) {
    const dot = document.createElement("span");
    dot.className = "folder-dot";
    dot.style.background = color;
    btn.appendChild(dot);
  }

  const span = document.createElement("span");
  span.className = "folder-menu-name";
  span.textContent = name;
  btn.appendChild(span);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ============================================================
// 가져오기 / 내보내기 / 전체 삭제
// ============================================================
async function exportClips() {
  const clips = await getAllClips();
  const blob = new Blob([JSON.stringify(clips, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `textclip-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importClips(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("JSON이 배열 형식이 아닙니다");

    const MAX_TITLE = 500;
    const MAX_BODY = 100 * 1024;
    const MAX_SUMMARY = 2000;
    const MAX_KEYWORDS = 20;
    const MAX_KEYWORD_LEN = 50;

    const cleaned = [];
    let skipped = 0;

    for (const d of data) {
      if (!d || typeof d !== "object") { skipped++; continue; }

      const title = String(d.title || "").slice(0, MAX_TITLE);
      const body = String(d.body || d.content || "").slice(0, MAX_BODY);
      if (!title && !body) { skipped++; continue; }

      const summary = String(d.summary || "").slice(0, MAX_SUMMARY);
      const date = typeof d.date === "string" ? d.date.slice(0, 50) : "";
      const savedAt = typeof d.savedAt === "string" ? d.savedAt : new Date().toISOString();

      let keywords = [];
      if (Array.isArray(d.keywords)) {
        keywords = d.keywords
          .filter(k => typeof k === "string")
          .map(k => k.slice(0, MAX_KEYWORD_LEN))
          .slice(0, MAX_KEYWORDS);
      }

      const sUrl = safeUrl(typeof d.url === "string" ? d.url : "");
      const url = sUrl === "#" ? "" : sUrl;

      cleaned.push({ title, date, body, summary, keywords, url, savedAt });
    }

    if (cleaned.length === 0) {
      alert(skipped > 0
        ? `❌ 가져올 수 있는 클립이 없습니다. (${skipped}개 모두 형식 불일치)`
        : "가져올 클립이 없습니다.");
      return;
    }

    const added = await bulkAddClips(cleaned);
    let msg = `✅ ${added}개 클립을 가져왔습니다.`;
    if (skipped > 0) msg += `\n(${skipped}개는 형식이 맞지 않아 스킵되었습니다.)`;
    alert(msg);
    await refresh();
  } catch (err) {
    alert(`❌ 가져오기 실패: ${err.message}`);
  } finally {
    e.target.value = "";
  }
}

async function confirmClearAll() {
  const count = state.allClips.length;
  if (count === 0) return;
  if (!confirm(`정말 ${count}개의 클립을 모두 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.\n먼저 내보내기로 백업하는 것을 권장합니다.`)) return;
  if (!confirm(`마지막 확인 — 정말 ${count}개 모두 삭제할까요?`)) return;
  await clearAllClips();
  await refresh();
}

// ============================================================
// 유틸
// ============================================================
function safeUrl(url) {
  if (!url || typeof url !== "string") return "#";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "#";
    return u.href;
  } catch {
    return "#";
  }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const m = dateStr.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : dateStr;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

// ============================================================
// AI 요약 클립보드 브릿지
// ============================================================
let currentClipForAI = null;

function showToast(message, duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

async function handleAISummarize(clip) {
  try {
    const prompt = await getActivePrompt();
    if (!prompt) {
      showToast("⚠️ 활성 프롬프트가 없습니다. 설정에서 추가하세요.");
      return;
    }
    const body = clip.body || clip.content || "";
    const textToCopy = prompt.content + body;
    await navigator.clipboard.writeText(textToCopy);
    showToast("✅ 복사 완료! 사용하시는 AI(Gemini, GPT, Claude 등)에 붙여넣으세요");
    // 잠깐 후 결과 입력 모달 자동 표시 (사용자가 AI에 붙여넣고 응답받아올 시간)
    setTimeout(() => openAIResultModal(clip), 800);
  } catch (e) {
    console.error(e);
    showToast("❌ 복사 실패: " + e.message);
  }
}

function openAIResultModal(clip) {
  currentClipForAI = clip;
  const modal = document.getElementById('aiResultModal');
  const textarea = document.getElementById('aiResponseInput');
  textarea.value = "";
  modal.hidden = false;
  setTimeout(() => textarea.focus(), 100);
}

function closeAIResultModal() {
  document.getElementById('aiResultModal').hidden = true;
  currentClipForAI = null;
}

init();
