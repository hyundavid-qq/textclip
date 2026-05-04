// settings.js — TextClip 설정 페이지

// null = 새 프롬프트 추가 모드, string = 해당 id 편집 모드
let editingId = null;

const $ = (sel) => document.querySelector(sel);

async function init() {
  await renderList();
  await renderDataStats();

  $("#btnAddPrompt").addEventListener("click", openFormForNew);
  $("#btnPromptCancel").addEventListener("click", closeForm);
  $("#btnPromptSave").addEventListener("click", handleSave);

  $("#btnExportData").addEventListener("click", handleExportData);
  $("#btnImportData").addEventListener("click", () => $("#dataFileInput").click());
  $("#dataFileInput").addEventListener("change", handleImportData);
}

async function renderList() {
  const prompts = await getAllPrompts();

  // 정렬: 즐겨찾기 → 활성 → 원래(시드/추가) 순서
  // Array.prototype.sort는 안정 정렬이라 동등 항목은 원래 순서 유지
  const sorted = [...prompts].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return 0;
  });

  const list = $("#promptList");
  list.innerHTML = "";
  for (const p of sorted) {
    list.appendChild(makePromptItem(p));
  }
}

function makePromptItem(prompt) {
  const t = $("#promptItemTemplate").content.cloneNode(true);
  const item = t.querySelector(".prompt-item");
  item.dataset.id = prompt.id;
  if (prompt.isActive) item.classList.add("is-active");

  const radio = item.querySelector(".prompt-radio");
  radio.checked = !!prompt.isActive;
  radio.addEventListener("change", async () => {
    await setActivePrompt(prompt.id);
    await renderList();
    showToast(`✅ "${prompt.name}" 활성화됨`);
  });

  const favBtn = item.querySelector(".favorite-btn");
  favBtn.textContent = prompt.isFavorite ? "★" : "☆";
  if (prompt.isFavorite) favBtn.classList.add("is-favorite");
  favBtn.title = prompt.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가";
  favBtn.addEventListener("click", async () => {
    await toggleFavorite(prompt.id);
    await renderList();
  });

  item.querySelector(".prompt-name").textContent = prompt.name;
  item.querySelector(".prompt-content-preview").textContent = prompt.content;

  item.querySelector(".prompt-edit").addEventListener("click", () => openFormForEdit(prompt));
  item.querySelector(".prompt-delete").addEventListener("click", () => handleDelete(prompt));

  return item;
}

function openFormForNew() {
  editingId = null;
  $("#promptFormTitle").textContent = "새 프롬프트";
  $("#promptNameInput").value = "";
  $("#promptContentInput").value = "";
  $("#promptForm").hidden = false;
  $("#btnAddPrompt").hidden = true;
  $("#promptNameInput").focus();
  $("#promptForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openFormForEdit(prompt) {
  editingId = prompt.id;
  $("#promptFormTitle").textContent = "프롬프트 편집";
  $("#promptNameInput").value = prompt.name;
  $("#promptContentInput").value = prompt.content;
  $("#promptForm").hidden = false;
  $("#btnAddPrompt").hidden = true;
  $("#promptNameInput").focus();
  $("#promptForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeForm() {
  $("#promptForm").hidden = true;
  $("#btnAddPrompt").hidden = false;
  editingId = null;
}

async function handleSave() {
  const name = $("#promptNameInput").value.trim();
  const content = $("#promptContentInput").value;

  if (name.length < 1 || name.length > 30) {
    showToast("⚠️ 이름은 1-30자로 입력하세요");
    $("#promptNameInput").focus();
    return;
  }
  if (content.trim().length < 10) {
    showToast("⚠️ 내용은 10자 이상 입력하세요");
    $("#promptContentInput").focus();
    return;
  }

  if (editingId) {
    await updatePrompt(editingId, { name, content });
    showToast("✅ 프롬프트가 수정되었습니다");
  } else {
    await addPrompt({ name, content });
    showToast("✅ 새 프롬프트가 추가되었습니다");
  }

  closeForm();
  await renderList();
}

async function handleDelete(prompt) {
  // 활성 프롬프트는 삭제 불가
  if (prompt.isActive) {
    showToast("⚠️ 활성 프롬프트는 삭제할 수 없습니다. 다른 프롬프트를 활성으로 바꾼 뒤 삭제하세요");
    return;
  }
  if (!confirm(`"${prompt.name}" 프롬프트를 삭제할까요?`)) return;
  try {
    await deletePrompt(prompt.id);
  } catch (e) {
    if (e.message === "ACTIVE_PROMPT_NOT_DELETABLE") {
      showToast("⚠️ 활성 프롬프트는 삭제할 수 없습니다");
      return;
    }
    throw e;
  }
  await renderList();
  showToast("✅ 프롬프트가 삭제되었습니다");
}

// ============================================================
// 데이터 관리
// ============================================================
async function renderDataStats() {
  const [clips, folders, stored] = await Promise.all([
    getAllClips(),
    getAllFolders(),
    chrome.storage.local.get("lastExportDate"),
  ]);
  $("#statClips").textContent = clips.length.toLocaleString("ko-KR");
  $("#statFolders").textContent = folders.length.toLocaleString("ko-KR");
  $("#statLastBackup").textContent = stored.lastExportDate
    ? formatRelativeTime(new Date(stored.lastExportDate))
    : "아직 백업하지 않음";
}

function formatRelativeTime(date) {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 30) return `${diffDay}일 전`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

async function handleExportData() {
  const clips = await getAllClips();
  if (clips.length === 0) {
    showToast("⚠️ 내보낼 클립이 없습니다");
    return;
  }
  const blob = new Blob([JSON.stringify(clips, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `textclip-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  await chrome.storage.local.set({ lastExportDate: new Date().toISOString() });
  await renderDataStats();
  showToast("✅ 내보내기 완료");
}

async function handleImportData(e) {
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
    await renderDataStats();
    const message = dupClips.length > 0
      ? `✅ ${added}개 추가됨 (저장한 클립으로) · ${dupClips.length}개 중복 스킵`
      : `✅ ${added}개 추가됨 (저장한 클립으로)`;
    showToast(message);
  } catch (err) {
    alert(`❌ 가져오기 실패: ${err.message}`);
  } finally {
    e.target.value = "";
  }
}

function showToast(message, duration = 4000) {
  const container = $("#toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

init();
