// settings.js — TextClip 설정 페이지

// null = 새 프롬프트 추가 모드, string = 해당 id 편집 모드
let editingId = null;

const $ = (sel) => document.querySelector(sel);

async function init() {
  await renderList();

  $("#btnAddPrompt").addEventListener("click", openFormForNew);
  $("#btnPromptCancel").addEventListener("click", closeForm);
  $("#btnPromptSave").addEventListener("click", handleSave);
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

function showToast(message, duration = 4000) {
  const container = $("#toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

init();
