// viewer.js — 보관함 메인 로직

// folderId 특수값: "전체" 가상 폴더 (모든 클립 표시, 필터 없음)
const ALL_FOLDER = "__ALL__";

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
  folderId: ALL_FOLDER, // ALL_FOLDER = 전체 / null = 저장한 클립 / number = 특정 폴더
  keyword: null,
  sort: "savedAt-desc",
  selectedClipIds: new Set(),
};

const $ = (sel) => document.querySelector(sel);

async function init() {
  await refresh();
  await updateActivePromptDisplay();

  // settings에서 활성 프롬프트 변경 시 viewer 탭에서도 즉시 반영
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.aiPrompts) {
      updateActivePromptDisplay();
    }
  });

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
    // 일괄 이동 드롭다운도 외부 클릭 시 닫기
    const bulkDropdown = document.getElementById("bulkMoveDropdown");
    if (bulkDropdown && !bulkDropdown.contains(e.target)) {
      closeBulkMoveDropdown();
    }
  });

  // 일괄 작업 액션바
  $("#btnBulkMove").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleBulkMoveDropdown();
  });
  $("#btnBulkSelectAll").addEventListener("click", handleBulkSelectAll);
  $("#btnBulkDelete").addEventListener("click", handleBulkDelete);
  $("#btnBulkClear").addEventListener("click", clearSelection);
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

  // 전체 — 가상 폴더, 항상 맨 위
  list.appendChild(makeFolderItem({
    id: ALL_FOLDER,
    name: "전체",
    color: null,
    count: state.allClips.length,
    isAll: true,
    isActive: state.folderId === ALL_FOLDER,
  }));

  // 저장한 클립 — 폴더 미지정, 액션 없음
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

function makeFolderItem({ id, name, color, count, isInbox, isActive, isAll }) {
  const li = document.createElement("li");
  li.className = "folder-item"
    + (isActive ? " active" : "")
    + (isInbox ? " folder-inbox" : "")
    + (isAll ? " folder-all" : "");

  if (isAll) {
    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.textContent = "🗂";
    li.appendChild(icon);
  } else if (isInbox) {
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

  // 가상 폴더(전체/저장한 클립)는 액션 없음
  if (!isInbox && !isAll) {
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
    if (state.folderId !== id) clearSelection();
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
  if (state.folderId === id) state.folderId = ALL_FOLDER;
  await refresh();
}

// ============================================================
// 메인 렌더
// ============================================================
function render() {
  let arr = [...state.allClips];

  if (state.folderId === ALL_FOLDER) {
    // 전체: 필터 없음
  } else if (state.folderId === null) {
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
  if (state.folderId === ALL_FOLDER) {
    // 전체일 땐 chip 없음
  } else if (state.folderId === null) {
    chips.appendChild(makeChip(`폴더: 저장한 클립`, () => {
      state.folderId = ALL_FOLDER;
      renderSidebar();
      render();
    }));
  } else {
    const folder = state.folders.find(f => f.id === state.folderId);
    if (folder) {
      chips.appendChild(makeChip(`폴더: ${folder.name}`, () => {
        state.folderId = ALL_FOLDER;
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

  // 다중 선택 체크박스
  const checkbox = card.querySelector(".card-checkbox");
  const isSelected = state.selectedClipIds.has(clip.id);
  checkbox.checked = isSelected;
  if (isSelected) card.classList.add("is-selected");
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.selectedClipIds.add(clip.id);
      card.classList.add("is-selected");
    } else {
      state.selectedClipIds.delete(clip.id);
      card.classList.remove("is-selected");
    }
    updateBulkBar();
  });

  renderDateView(card.querySelector(".card-date"), clip);

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
  renderTitleView(titleEl, clip);

  const sum = card.querySelector(".card-summary");
  renderSummaryView(sum, clip);

  const kwBox = card.querySelector(".card-keywords");
  renderKeywordsView(kwBox, clip);

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
// 인라인 편집 (제목 / 날짜 / 요약)
// ============================================================
function cancelAllInlineEdits() {
  document.querySelectorAll('[data-inline-editing="true"]').forEach(el => {
    if (typeof el.__cancelEdit === "function") el.__cancelEdit();
  });
}

// ----- 제목 -----
function renderTitleView(titleEl, clip) {
  titleEl.innerHTML = "";
  titleEl.classList.remove("editing");
  delete titleEl.dataset.inlineEditing;
  titleEl.__cancelEdit = null;

  const safeHref = safeUrl(clip.url);
  const hasValidUrl = safeHref !== "#";

  const titleContent = hasValidUrl
    ? document.createElement("a")
    : document.createElement("span");
  if (hasValidUrl) {
    titleContent.href = safeHref;
    titleContent.target = "_blank";
    titleContent.rel = "noopener";
  }
  titleContent.className = "title-text";
  titleContent.textContent = clip.title || "(제목 없음)";
  titleEl.appendChild(titleContent);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-inline-edit btn-edit-title";
  editBtn.textContent = "✏️";
  editBtn.title = "제목 편집";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    enterTitleEditMode(titleEl, clip);
  });
  titleEl.appendChild(editBtn);
}

function enterTitleEditMode(titleEl, clip) {
  cancelAllInlineEdits();

  titleEl.innerHTML = "";
  titleEl.classList.add("editing");
  titleEl.dataset.inlineEditing = "true";
  titleEl.__cancelEdit = () => renderTitleView(titleEl, clip);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-input";
  input.maxLength = 200;
  input.value = clip.title || "";
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await saveTitle(clip, input.value, titleEl);
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderTitleView(titleEl, clip);
    }
  });
  titleEl.appendChild(input);

  setTimeout(() => { input.focus(); input.select(); }, 0);
}

async function saveTitle(clip, newTitle, titleEl) {
  const trimmed = newTitle.trim().slice(0, 200);
  if (!trimmed) {
    showToast("⚠️ 제목은 비워둘 수 없습니다");
    return;
  }
  if (trimmed === clip.title) {
    renderTitleView(titleEl, clip);
    return;
  }
  const fresh = await getClip(clip.id);
  if (!fresh) {
    showToast("❌ 클립이 더 이상 존재하지 않습니다");
    return;
  }
  fresh.title = trimmed;
  await updateClip(fresh);
  await refresh();
}

// ----- 날짜 -----
function renderDateView(dateEl, clip) {
  dateEl.innerHTML = "";
  dateEl.classList.remove("editing");
  delete dateEl.dataset.inlineEditing;
  dateEl.__cancelEdit = null;

  const text = document.createElement("span");
  text.className = "card-date-text";
  text.textContent = formatDate(clip.date);
  dateEl.appendChild(text);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-inline-edit btn-edit-date";
  editBtn.textContent = "✏️";
  editBtn.title = "날짜 편집";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    enterDateEditMode(dateEl, clip);
  });
  dateEl.appendChild(editBtn);
}

function enterDateEditMode(dateEl, clip) {
  cancelAllInlineEdits();

  dateEl.innerHTML = "";
  dateEl.classList.add("editing");
  dateEl.dataset.inlineEditing = "true";
  dateEl.__cancelEdit = () => renderDateView(dateEl, clip);

  const input = document.createElement("input");
  input.type = "date";
  input.className = "inline-input";
  const m = (clip.date || "").match(/^\d{4}-\d{2}-\d{2}/);
  input.value = m ? m[0] : "";
  input.addEventListener("change", async () => {
    const newDate = input.value;
    if (!newDate) {
      showToast("⚠️ 날짜를 선택하세요");
      return;
    }
    if (newDate === clip.date) {
      renderDateView(dateEl, clip);
      return;
    }
    const fresh = await getClip(clip.id);
    if (!fresh) {
      showToast("❌ 클립이 더 이상 존재하지 않습니다");
      return;
    }
    fresh.date = newDate;
    await updateClip(fresh);
    await refresh();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      renderDateView(dateEl, clip);
    }
  });
  dateEl.appendChild(input);

  setTimeout(() => input.focus(), 0);
}

// ----- 요약 -----
function renderSummaryView(sumEl, clip) {
  sumEl.innerHTML = "";
  sumEl.className = "card-summary";
  delete sumEl.dataset.inlineEditing;
  sumEl.__cancelEdit = null;

  if (clip.summary) {
    sumEl.append(clip.summary);
    if (clip.summarySource === "ai") sumEl.classList.add("is-ai");
    else if (clip.summarySource === "manual") sumEl.classList.add("is-manual");
  } else {
    sumEl.classList.add("is-empty");
    const placeholder = document.createElement("span");
    placeholder.className = "summary-placeholder";
    placeholder.textContent = "요약 없음";
    sumEl.appendChild(placeholder);
  }

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-inline-edit btn-edit-summary";
  editBtn.textContent = "✏️";
  editBtn.title = "요약 편집";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    enterSummaryEditMode(sumEl, clip);
  });
  sumEl.appendChild(editBtn);
}

function enterSummaryEditMode(sumEl, clip) {
  cancelAllInlineEdits();

  sumEl.innerHTML = "";
  sumEl.className = "card-summary editing";
  sumEl.dataset.inlineEditing = "true";
  sumEl.__cancelEdit = () => renderSummaryView(sumEl, clip);

  const textarea = document.createElement("textarea");
  textarea.className = "inline-textarea";
  textarea.rows = 5;
  textarea.value = clip.summary || "";
  textarea.placeholder = "요약을 입력하세요…";
  textarea.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      await saveSummary(clip, textarea.value, sumEl);
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderSummaryView(sumEl, clip);
    }
  });
  sumEl.appendChild(textarea);

  const actions = document.createElement("div");
  actions.className = "inline-edit-actions";

  const hint = document.createElement("span");
  hint.className = "inline-edit-hint";
  hint.textContent = "Ctrl+Enter로 저장 · Esc로 취소";
  actions.appendChild(hint);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-save-keywords";
  saveBtn.textContent = "저장";
  saveBtn.addEventListener("click", async () => {
    await saveSummary(clip, textarea.value, sumEl);
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-cancel-keywords";
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", () => {
    renderSummaryView(sumEl, clip);
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  sumEl.appendChild(actions);

  setTimeout(() => textarea.focus(), 0);
}

async function saveSummary(clip, newSummary, sumEl) {
  const trimmed = newSummary.trim();
  const fresh = await getClip(clip.id);
  if (!fresh) {
    showToast("❌ 클립이 더 이상 존재하지 않습니다");
    return;
  }
  fresh.summary = trimmed;
  fresh.summarySource = trimmed ? "manual" : "";
  await updateClip(fresh);
  await refresh();
}

// ============================================================
// 키워드 렌더 / 인라인 편집
// ============================================================
function renderKeywordsView(kwBox, clip) {
  kwBox.innerHTML = "";
  kwBox.classList.remove("editing");
  kwBox.__editingClip = null;

  for (const kw of (clip.keywords || [])) {
    const norm = String(kw).replace(/^#/, "").trim();
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

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-edit-keywords";
  editBtn.textContent = "✏️";
  editBtn.title = "키워드 편집";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    enterKeywordEditMode(kwBox, clip);
  });
  kwBox.appendChild(editBtn);
}

function enterKeywordEditMode(kwBox, clip) {
  // 다른 카드가 편집 중이면 먼저 view 모드로 되돌리기 (저장 안 함)
  document.querySelectorAll(".card-keywords.editing").forEach(other => {
    if (other !== kwBox && other.__editingClip) {
      renderKeywordsView(other, other.__editingClip);
    }
  });

  const working = (clip.keywords || [])
    .map(k => String(k).replace(/^#/, "").trim())
    .filter(Boolean);

  kwBox.innerHTML = "";
  kwBox.classList.add("editing");
  kwBox.__editingClip = clip;

  // 기존 키워드 → 편집 칩
  for (const kw of working) {
    kwBox.appendChild(buildKeywordChip(kw, working, kwBox));
  }

  // input
  const input = document.createElement("input");
  input.type = "text";
  input.className = "keyword-input";
  input.placeholder = "+ 키워드 추가";
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = input.value.trim();
      if (!v || working.includes(v)) {
        input.value = "";
        return;
      }
      working.push(v);
      input.before(buildKeywordChip(v, working, kwBox));
      input.value = "";
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderKeywordsView(kwBox, clip);
    }
  });
  kwBox.appendChild(input);

  // 저장 / 취소
  const actions = document.createElement("span");
  actions.className = "keyword-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-save-keywords";
  saveBtn.textContent = "저장";
  saveBtn.addEventListener("click", async () => {
    // 저장 시점에 클립이 사라졌을 수 있으니 재조회
    const fresh = await getClip(clip.id);
    if (!fresh) {
      showToast("❌ 클립이 더 이상 존재하지 않습니다");
      renderKeywordsView(kwBox, clip);
      return;
    }
    fresh.keywords = [...working];
    await updateClip(fresh);
    await refresh();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-cancel-keywords";
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", () => {
    renderKeywordsView(kwBox, clip);
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  kwBox.appendChild(actions);

  input.focus();
}

function buildKeywordChip(kw, working, kwBox) {
  const chip = document.createElement("span");
  chip.className = "keyword-chip-edit";
  chip.append(kw);

  const x = document.createElement("button");
  x.type = "button";
  x.className = "chip-x";
  x.textContent = "×";
  x.title = "삭제";
  x.addEventListener("click", () => {
    const idx = working.indexOf(kw);
    if (idx !== -1) working.splice(idx, 1);
    chip.remove();
    kwBox.querySelector(".keyword-input")?.focus();
  });
  chip.appendChild(x);

  return chip;
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
    const { cleaned, skipped } = parseClipsImport(text);

    if (cleaned.length === 0) {
      alert(skipped > 0
        ? `❌ 가져올 수 있는 클립이 없습니다. (${skipped}개 모두 형식 불일치)`
        : "가져올 클립이 없습니다.");
      return;
    }

    const existing = await getAllClips();
    const { newClips, dupClips } = dedupeClipsAgainstExisting(cleaned, existing);

    if (newClips.length === 0) {
      alert(`⚠️ 가져올 새 클립이 없습니다.\n${cleaned.length}개 모두 이미 존재합니다.`);
      return;
    }

    const confirmMsg = dupClips.length > 0
      ? `총 ${cleaned.length}개 중 ${dupClips.length}개는 중복으로 스킵, ${newClips.length}개 추가됩니다.\n📁 가져온 클립은 '저장한 클립'으로 들어갑니다 (폴더 미지정).\n\n계속할까요?`
      : `${newClips.length}개의 클립을 추가합니다 (기존 클립은 유지).\n📁 가져온 클립은 '저장한 클립'으로 들어갑니다 (폴더 미지정).\n\n계속할까요?`;
    if (!confirm(confirmMsg)) return;

    const added = await bulkAddClips(newClips);
    const message = dupClips.length > 0
      ? `✅ ${added}개 추가됨 (저장한 클립으로) · ${dupClips.length}개 중복 스킵`
      : `✅ ${added}개 추가됨 (저장한 클립으로)`;
    showToast(message);
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
// 다중 선택 / 일괄 작업
// ============================================================
function updateBulkBar() {
  const bar = document.getElementById("bulkActionBar");
  const count = state.selectedClipIds.size;
  if (count === 0) {
    bar.hidden = true;
    closeBulkMoveDropdown();
  } else {
    bar.hidden = false;
    document.getElementById("bulkCount").textContent = count;
  }
}

function clearSelection() {
  state.selectedClipIds.clear();
  document.querySelectorAll(".card.is-selected").forEach(c => c.classList.remove("is-selected"));
  document.querySelectorAll(".card-checkbox:checked").forEach(cb => { cb.checked = false; });
  updateBulkBar();
}

function toggleBulkMoveDropdown() {
  const menu = document.querySelector("#bulkMoveDropdown .dropdown-menu");
  if (!menu) return;
  if (menu.hidden) {
    populateBulkDropdown();
    menu.hidden = false;
  } else {
    menu.hidden = true;
  }
}

function closeBulkMoveDropdown() {
  const menu = document.querySelector("#bulkMoveDropdown .dropdown-menu");
  if (menu) menu.hidden = true;
}

function populateBulkDropdown() {
  const menu = document.querySelector("#bulkMoveDropdown .dropdown-menu");
  menu.innerHTML = "";

  // 저장한 클립으로 (folderId = null)
  const inboxItem = document.createElement("div");
  inboxItem.className = "dropdown-item";
  inboxItem.innerHTML = `<span style="font-size:14px">📥</span><span>저장한 클립으로</span>`;
  inboxItem.addEventListener("click", () => handleBulkMove(null));
  menu.appendChild(inboxItem);

  menu.appendChild(makeDropdownSeparator());

  // 사용자 폴더
  const sorted = [...state.folders].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || "")
  );
  for (const f of sorted) {
    const item = document.createElement("div");
    item.className = "dropdown-item";
    const dot = document.createElement("span");
    dot.className = "folder-dot";
    dot.style.background = f.color || "#999";
    item.appendChild(dot);
    const span = document.createElement("span");
    span.textContent = f.name;
    item.appendChild(span);
    item.addEventListener("click", () => handleBulkMove(f.id));
    menu.appendChild(item);
  }
  if (sorted.length > 0) menu.appendChild(makeDropdownSeparator());

  // 새 폴더 만들기
  const newItem = document.createElement("div");
  newItem.className = "dropdown-item special";
  newItem.textContent = "+ 새 폴더 만들기";
  newItem.addEventListener("click", handleBulkMoveToNew);
  menu.appendChild(newItem);
}

function makeDropdownSeparator() {
  const sep = document.createElement("div");
  sep.className = "dropdown-separator";
  return sep;
}

async function handleBulkMove(folderId) {
  closeBulkMoveDropdown();
  const ids = [...state.selectedClipIds];
  if (ids.length === 0) return;
  try {
    await Promise.all(ids.map(id => moveClipToFolder(id, folderId)));
    state.selectedClipIds.clear();
    await refresh();
    showToast(`✅ ${ids.length}개 클립을 이동했습니다`);
  } catch (e) {
    console.error(e);
    showToast("❌ 일부 클립 이동 실패");
    await refresh();
  }
}

async function handleBulkMoveToNew() {
  closeBulkMoveDropdown();
  const raw = prompt("새 폴더 이름:");
  if (!raw) return;
  const name = raw.trim().slice(0, 50);
  if (!name) return;
  const newFolderId = await addFolder({
    name,
    color: nextFolderColor(state.folders),
    createdAt: new Date().toISOString(),
  });
  await handleBulkMove(newFolderId);
}

function handleBulkSelectAll() {
  // 현재 필터링된 카드만 선택 (검색·폴더·키워드로 가려진 카드는 제외)
  for (const clip of state.filtered) {
    state.selectedClipIds.add(clip.id);
  }
  render();
  updateBulkBar();
}

async function handleBulkDelete() {
  const count = state.selectedClipIds.size;
  if (count === 0) return;
  if (!confirm(`선택한 ${count}개의 클립을 삭제할까요?`)) return;
  const ids = [...state.selectedClipIds];
  try {
    await Promise.all(ids.map(id => deleteClip(id)));
    state.selectedClipIds.clear();
    await refresh();
    showToast(`✅ ${ids.length}개 클립을 삭제했습니다`);
  } catch (e) {
    console.error(e);
    showToast("❌ 일부 클립 삭제 실패");
    await refresh();
  }
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

async function updateActivePromptDisplay() {
  const el = document.getElementById("activePromptName");
  if (!el) return;
  try {
    const active = await getActivePrompt();
    if (active && active.name) {
      el.textContent = active.name;
      el.classList.remove("is-empty");
    } else {
      el.textContent = "프롬프트 없음";
      el.classList.add("is-empty");
    }
  } catch (e) {
    el.textContent = "프롬프트 없음";
    el.classList.add("is-empty");
  }
}

init();
