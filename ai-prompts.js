// ai-prompts.js — chrome.storage.local 기반 AI 프롬프트 저장소

const _PROMPT_KEY = 'aiPrompts';

// 첫 실행 시 시드되는 11개 프롬프트 (직무별 프리셋 10 + 기본 1)
// 첫 번째(investor)가 기본 활성. 나머지는 비활성, 즐겨찾기 X.
const _SEED_PROMPTS = [
  {
    id: "preset:investor",
    name: "💼 투자 심사역 (VC/PE)",
    content: "당신은 10년차 투자 심사역입니다. 아래 내용에서 인수 주체, 대상, 거래 가액, 자금 조달 방식을 육하원칙에 따라 2~3문장으로 요약해주세요. 수치 데이터 중심으로 정확히 요약만 말해주세요.\n\n---\n\n",
    isActive: true,
    isFavorite: false,
  },
  {
    id: "preset:pr",
    name: "📢 홍보·대외협력 (PR/PA)",
    content: "당신은 10년차 기업 홍보 전문가입니다. 아래 기사에서 [우리 기업]에 미칠 영향과 핵심 팩트를 육하원칙에 따라 2~3문장으로 요약해주세요. 수식어 없이 팩트 위주로 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "preset:strategy",
    name: "📊 마켓 인텔리전스 (MI/전략)",
    content: "당신은 10년차 전략 기획 전문가입니다. 아래 자료에서 시장 변화의 동인과 주요 경쟁사의 움직임을 육하원칙에 따라 2~3문장으로 요약해주세요. 본문의 정보만 사용하여 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "preset:legal",
    name: "⚖️ 법무·컴플라이언스 (Legal)",
    content: "당신은 10년차 법무 실무자입니다. 아래 전문에서 준수 의무 대상, 위반 시 제재, 시행 시점을 육하원칙에 따라 2~3문장으로 요약해주세요. 법률적 사실에만 입각해 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "preset:editor",
    name: "✍️ 콘텐츠 에디터 (Editor)",
    content: "당신은 10년차 콘텐츠 디렉터입니다. 아래 텍스트에서 가장 중요한 통찰과 그 근거를 육하원칙에 따라 2~3문장으로 요약해주세요. 독자가 이해하기 쉽게 핵심만 추출해 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "preset:pm",
    name: "🛠️ IT 기획·PM",
    content: "당신은 10년차 시니어 PM입니다. 아래 내용에서 사용자의 고충(Pain Point)과 제안된 해결책을 육하원칙에 따라 2~3문장으로 요약해주세요. 기술적 팩트 위주로 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "preset:sales",
    name: "🤝 영업·고객 성공 (Sales/CS)",
    content: "당신은 10년차 영업 전략가입니다. 아래 고객사 소식에서 고객사의 현재 고민과 향후 사업 방향을 육하원칙에 따라 2~3문장으로 요약해주세요. 비즈니스 기회 관점에서 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "preset:hr",
    name: "👥 인사·채용 (HR)",
    content: "당신은 10년차 인사팀장입니다. 아래 자료에서 인재 채용 트렌드의 변화와 구체적인 적용 사례를 육하원칙에 따라 2~3문장으로 요약해주세요. 본문 텍스트에 기반해 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "preset:policy",
    name: "🏛️ 공공기관·정책 연구 (Policy)",
    content: "당신은 10년차 정책 연구원입니다. 아래 발표문에서 정책의 수혜 대상, 예산 규모, 기대 효과를 육하원칙에 따라 2~3문장으로 요약해주세요. 행정적 팩트를 중심으로 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "preset:learner",
    name: "📚 학습·자기계발 (Student)",
    content: "당신은 10년차 지식 큐레이터입니다. 아래 학습 자료에서 핵심 개념의 정의와 실제 적용 방법을 육하원칙에 따라 2~3문장으로 요약해주세요. 주관적 해석 없이 본문 내용만 요약만 말해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
  {
    id: "default",
    name: "기본 요약 (육하원칙)",
    content: "아래의 내용을 2~3문장으로 요약해주세요. 육하원칙(누가, 언제, 어디서, 무엇을, 어떻게, 왜)에 따라 정확히 요약해주고, 환각이나 추측 없이 본문에 있는 내용만 사용해주세요.\n\n---\n\n",
    isActive: false, isFavorite: false,
  },
];

// 동시 호출 시 시드가 두 번 일어나지 않도록 in-flight 프로미스를 공유
let _inflightLoad = null;

async function _loadPromptStore() {
  if (_inflightLoad) return _inflightLoad;
  _inflightLoad = (async () => {
    try {
      const r = await chrome.storage.local.get(_PROMPT_KEY);
      let data = r[_PROMPT_KEY];

      // 키 없거나 손상된 경우 빈 store로 시작
      if (!data || !Array.isArray(data.prompts)) {
        data = { prompts: [] };
      }

      let modified = false;

      // 마이그레이션: isFavorite 필드 없으면 false로 보정
      for (const p of data.prompts) {
        if (typeof p.isFavorite !== "boolean") {
          p.isFavorite = false;
          modified = true;
        }
      }

      // 시드 정책: preset:* ID가 하나도 없으면 10개 프리셋을 append (idempotent)
      // - 기본 프롬프트(id="default") 등 사용자 데이터는 안 건드림
      // - 기존에 활성 프롬프트가 있으면 그대로 유지, 없을 때만 preset:investor 활성
      const hasPreset = data.prompts.some(p =>
        typeof p.id === "string" && p.id.startsWith("preset:")
      );
      if (!hasPreset) {
        const presets = _SEED_PROMPTS.filter(p =>
          typeof p.id === "string" && p.id.startsWith("preset:")
        );
        const hasActive = data.prompts.some(p => p.isActive);
        const presetCopies = presets.map(p => ({
          ...p,
          isActive: !hasActive && p.id === "preset:investor",
        }));
        data.prompts.push(...presetCopies);
        modified = true;
        console.log(`[TextClip] 프리셋 ${presets.length}개를 시드했습니다`);
      }

      if (modified) await _savePromptStore(data);
      return data;
    } finally {
      _inflightLoad = null;
    }
  })();
  return _inflightLoad;
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
  // 안전장치: 활성 없는데 프롬프트는 있으면 첫 번째를 활성화
  if (!active && data.prompts.length > 0) {
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
    isFavorite: false,
  };
  data.prompts.push(newPrompt);
  await _savePromptStore(data);
  return newPrompt.id;
}

async function updatePrompt(id, fields) {
  const data = await _loadPromptStore();
  const idx = data.prompts.findIndex(p => p.id === id);
  if (idx === -1) throw new Error(`Prompt ${id} not found`);
  // isActive / isFavorite은 setActivePrompt / toggleFavorite로만 바꾸도록 분리
  const allowed = {};
  if (typeof fields.name === "string") allowed.name = fields.name.slice(0, 100);
  if (typeof fields.content === "string") allowed.content = fields.content;
  data.prompts[idx] = { ...data.prompts[idx], ...allowed };
  await _savePromptStore(data);
}

// 정책: 활성 프롬프트는 삭제 불가. 비활성 프롬프트만 삭제 가능.
// → 활성을 다른 프롬프트로 옮긴 후에야 삭제할 수 있음
// → 결과적으로 항상 최소 1개의 프롬프트는 남음 (다시 시드도 안 함)
async function deletePrompt(id) {
  const data = await _loadPromptStore();
  const target = data.prompts.find(p => p.id === id);
  if (!target) return;
  if (target.isActive) {
    throw new Error("ACTIVE_PROMPT_NOT_DELETABLE");
  }
  data.prompts = data.prompts.filter(p => p.id !== id);
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

async function toggleFavorite(id) {
  const data = await _loadPromptStore();
  const p = data.prompts.find(p => p.id === id);
  if (!p) throw new Error(`Prompt ${id} not found`);
  p.isFavorite = !p.isFavorite;
  await _savePromptStore(data);
  return p.isFavorite;
}
