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
  const list = $("#promptList");
  list.innerHTML = "";
  for (const p of prompts) {
    list.appendChild(makePromptCard(p));
  }
}

function makePromptCard(prompt) {
  const t = $("#promptCardTemplate").content.cloneNode(true);
  const card = t.querySelector(".prompt-card");
  if (prompt.isActive) card.classList.add("active");

  const radio = card.querySelector("input[type='radio']");
  radio.checked = !!prompt.isActive;
  radio.dataset.id = prompt.id;
  radio.addEventListener("change", async () => {
    await setActivePrompt(prompt.id);
    await renderList();
    showToast(`✅ "${prompt.name}"이(가) 활성화되었습니다`);
  });

  card.querySelector(".prompt-name").textContent = prompt.name;
  card.querySelector(".prompt-preview").textContent = prompt.content;

  card.querySelector(".btn-edit-prompt").addEventListener("click", () => openFormForEdit(prompt));
  card.querySelector(".btn-delete-prompt").addEventListener("click", () => handleDelete(prompt));

  return card;
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
  if (prompt.isActive) {
    showToast("⚠️ 활성 프롬프트는 삭제할 수 없습니다. 다른 프롬프트를 활성으로 바꾼 후 시도하세요");
    return;
  }
  const all = await getAllPrompts();
  if (all.length <= 1) {
    showToast("⚠️ 마지막 프롬프트는 삭제할 수 없습니다");
    return;
  }
  if (!confirm(`"${prompt.name}" 프롬프트를 삭제할까요?`)) return;
  await deletePrompt(prompt.id);
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
