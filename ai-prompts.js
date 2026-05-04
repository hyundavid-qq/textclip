// ai-prompts.js — chrome.storage.local 기반 AI 프롬프트 저장소

const _PROMPT_KEY = 'aiPrompts';

const _DEFAULT_PROMPT = {
  id: "default",
  name: "기본 요약 (육하원칙)",
  content: "아래의 내용을 2~3문장으로 요약해주세요. 육하원칙(누가, 언제, 어디서, 무엇을, 어떻게, 왜)에 따라 정확히 요약해주고, 환각이나 추측 없이 본문에 있는 내용만 사용해주세요.\n\n---\n\n",
  isActive: true,
};

async function _loadPromptStore() {
  const r = await chrome.storage.local.get(_PROMPT_KEY);
  const data = r[_PROMPT_KEY];
  if (!data || !Array.isArray(data.prompts) || data.prompts.length === 0) {
    // 첫 실행: 기본 프롬프트 시드
    const seed = { prompts: [{ ..._DEFAULT_PROMPT }] };
    await chrome.storage.local.set({ [_PROMPT_KEY]: seed });
    return seed;
  }
  return data;
}

async function _savePromptStore(data) {
  await chrome.storage.local.set({ [_PROMPT_KEY]: data });
}

async function getAllPrompts() {
  const data = await _loadPromptStore();
  return data.prompts;
}

async function getActivePrompt() {
  const data = await _loadPromptStore();
  let active = data.prompts.find(p => p.isActive);
  if (!active && data.prompts.length > 0) {
    // 안전장치: 활성 프롬프트가 없으면 첫 번째를 활성화하고 저장
    data.prompts[0].isActive = true;
    await _savePromptStore(data);
    active = data.prompts[0];
  }
  return active || null;
}

async function addPrompt({ name, content }) {
  const data = await _loadPromptStore();
  const newPrompt = {
    id: `p_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    name: String(name || "이름 없음").slice(0, 100),
    content: String(content || ""),
    isActive: false,
  };
  data.prompts.push(newPrompt);
  await _savePromptStore(data);
  return newPrompt.id;
}

async function updatePrompt(id, fields) {
  const data = await _loadPromptStore();
  const idx = data.prompts.findIndex(p => p.id === id);
  if (idx === -1) throw new Error(`Prompt ${id} not found`);
  // isActive 변경은 setActivePrompt로만. 여기선 name/content만 허용
  const allowed = {};
  if (typeof fields.name === "string") allowed.name = fields.name.slice(0, 100);
  if (typeof fields.content === "string") allowed.content = fields.content;
  data.prompts[idx] = { ...data.prompts[idx], ...allowed };
  await _savePromptStore(data);
}

async function deletePrompt(id) {
  const data = await _loadPromptStore();
  const target = data.prompts.find(p => p.id === id);
  if (!target) return;
  data.prompts = data.prompts.filter(p => p.id !== id);
  if (data.prompts.length === 0) {
    // 마지막 하나까지 지우면 기본 프롬프트로 다시 시드
    data.prompts = [{ ..._DEFAULT_PROMPT }];
  } else if (target.isActive) {
    // 활성을 지웠으면 첫 번째를 자동 활성화
    data.prompts[0].isActive = true;
  }
  await _savePromptStore(data);
}

async function setActivePrompt(id) {
  const data = await _loadPromptStore();
  let found = false;
  for (const p of data.prompts) {
    if (p.id === id) { p.isActive = true; found = true; }
    else { p.isActive = false; }
  }
  if (!found) throw new Error(`Prompt ${id} not found`);
  await _savePromptStore(data);
}
