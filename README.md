# 📰 TextClip

> Clip text from any webpage with right-click. Organize into folders. Summarize with your AI — all stored locally.
>
> 어디서든 드래그 + 우클릭으로 저장. 폴더로 정리. 본인이 쓰는 AI로 한 번에 요약.

**Version**: 1.0.0 · **License**: MIT

---

## ✨ Key Features / 핵심 기능

- 📌 **One-click capture** — Drag → right-click → save. Works on any page.
  드래그 → 우클릭 → 저장. 어떤 웹페이지든.
- 🗂 **Folder organization** — Custom folders with color tags, multi-select bulk move/delete.
  사용자 폴더 + 색상 + 다중 선택 일괄 이동·삭제.
- 🤖 **AI summary, BYOK-free** — Copies prompt+body to clipboard for use with any AI (GPT/Gemini/Claude). No API key.
  본인이 쓰는 AI에 클립보드로 전달. API 키 불필요.
- 💼 **10 role-based prompt presets** — VC, PR, Strategy, Legal, Editor, PM, Sales, HR, Policy, Student. Plus custom prompts and ⭐ favorites.
  직무별 프리셋 10종 + 사용자 프롬프트 + ⭐ 즐겨찾기.
- ✏️ **Inline editing** — Title, date, summary, keywords editable directly on the card.
  제목·날짜·요약·키워드 인라인 편집.
- 🔒 **Local-only storage** — All data in Chrome IndexedDB on your device. Zero external network calls.
  IndexedDB 로컬 저장. 외부 통신 0.

---

## 📦 Install / 설치

**Manual install (current):**

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select this folder

**수동 설치:**

1. 이 저장소 클론 또는 다운로드
2. `chrome://extensions` 열기
3. **개발자 모드** ON (우측 상단)
4. **압축해제된 확장 프로그램 로드** → 이 폴더 선택

> Chrome Web Store distribution coming soon.

---

## 📋 Usage / 사용법

1. **Save a clip / 클립 저장**
   Select text on any page → right-click → "TextClip에 저장".
   웹페이지에서 텍스트 드래그 → 우클릭 → "TextClip에 저장".

2. **Organize / 정리**
   Open the library, create folders in the sidebar, select cards with the checkbox to move in bulk.
   보관함 열기 → 사이드바에서 폴더 만들기 → 카드 좌측 체크박스로 다중 선택 → 일괄 이동.

3. **Summarize with AI / AI 요약**
   Click 🤖 AI 요약 → prompt + body copy to clipboard → paste into your AI → paste the response back into the modal → save.
   🤖 AI 요약 클릭 → 프롬프트+본문이 클립보드 복사 → 본인 AI에 붙여넣기 → 응답을 다시 모달에 붙여넣고 저장.

4. **Manage prompts / 프롬프트 관리**
   ⚙ → use any of the 10 role presets, add your own, or mark with ⭐.
   ⚙ → 직무별 프리셋 10종 활용, 새 프롬프트 추가, ⭐ 즐겨찾기.

---

## 🔒 Privacy & Sync

### Privacy
- **No external servers** — all data stays on your device
- Stored in your Chrome profile (IndexedDB)
- AI summary uses clipboard (you choose which AI to paste into)

### No Auto-Sync Between Devices
TextClip does NOT automatically sync between your devices.
This is a deliberate choice for privacy.

To use on multiple PCs:
1. PC A: Library → 📤 Export (downloads JSON)
2. Move JSON to PC B (USB / cloud / email)
3. PC B: Library → 📥 Import (adds to existing clips)

**💡 Tip:** Save the export to a cloud folder (Dropbox / iCloud / Google Drive)
and you can import it on any PC easily.

### Data Loss Warning
- If you delete your Chrome profile or change PC, your data is gone.
- Export regularly (weekly recommended).

---

## 📂 Project Structure

```
manifest.json
background.js          Save logic (drag-text parsing + heuristic analysis + IDB write)
ai-prompts.js          Prompt store (chrome.storage.local)
db.js                  IndexedDB wrapper (clips + folders)
lite-analyzer.js       Heuristic summary + keyword extraction
popup.html/js/css      Toolbar popup
viewer.html/js/css     Library UI
settings.html/js/css   Prompt settings page
icons/                 16/48/128 PNG
```

---

## 🪪 License

MIT License — free to use, modify, and distribute.
