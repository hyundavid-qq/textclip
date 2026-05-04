// db.js - IndexedDB 래퍼 (background.js와 viewer.js 공용)

const DB_NAME = 'NewsClipperDB';
const DB_VERSION = 2;
const STORE = 'clips';
const FOLDERS = 'folders';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction; // 업그레이드 트랜잭션 (기존 store 접근용)

      // clips store: 신규 설치면 생성, 기존 설치면 folderId 인덱스만 추가
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('savedAt', 'savedAt', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('category', 'category', { unique: false }); // 레거시, 신규 코드는 미사용
        store.createIndex('keywords', 'keywords', { unique: false, multiEntry: true });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('folderId', 'folderId', { unique: false });
      } else {
        const store = tx.objectStore(STORE);
        if (!store.indexNames.contains('folderId')) {
          store.createIndex('folderId', 'folderId', { unique: false });
        }
      }

      // folders store
      if (!db.objectStoreNames.contains(FOLDERS)) {
        const folders = db.createObjectStore(FOLDERS, { keyPath: 'id', autoIncrement: true });
        folders.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addClip(clip) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(clip);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllClips() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getClip(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateClip(clip) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(clip);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteClip(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearAllClips() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function bulkAddClips(clips) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let added = 0;
    clips.forEach(c => {
      const copy = { ...c };
      delete copy.id; // auto-increment 사용
      const req = store.add(copy);
      req.onsuccess = () => added++;
    });
    tx.oncomplete = () => resolve(added);
    tx.onerror = () => reject(tx.error);
  });
}

async function getCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 클립을 폴더로 이동. folderId === null이면 저장한 클립(폴더 미지정)
async function moveClipToFolder(clipId, folderId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(clipId);
    getReq.onsuccess = () => {
      const clip = getReq.result;
      if (!clip) { reject(new Error(`Clip ${clipId} not found`)); return; }
      clip.folderId = folderId;
      const putReq = store.put(clip);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ============================================================
// Folder CRUD
// ============================================================
async function addFolder(folder) {
  // folder: { name, color?, createdAt }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FOLDERS, 'readwrite').objectStore(FOLDERS).add(folder);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllFolders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FOLDERS, 'readonly').objectStore(FOLDERS).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateFolder(folder) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FOLDERS, 'readwrite').objectStore(FOLDERS).put(folder);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// JSON 텍스트 → 정제된 clip 배열 (UI 비의존, viewer/settings 공용)
function parseClipsImport(text) {
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
    const summarySource = (d.summarySource === "ai" || d.summarySource === "manual") ? d.summarySource : "";
    const date = typeof d.date === "string" ? d.date.slice(0, 50) : "";
    const savedAt = typeof d.savedAt === "string" ? d.savedAt : new Date().toISOString();

    let keywords = [];
    if (Array.isArray(d.keywords)) {
      keywords = d.keywords
        .filter(k => typeof k === "string")
        .map(k => k.slice(0, MAX_KEYWORD_LEN))
        .slice(0, MAX_KEYWORDS);
    }

    let url = "";
    if (typeof d.url === "string" && d.url) {
      try {
        const u = new URL(d.url);
        if (u.protocol === "http:" || u.protocol === "https:") url = u.href;
      } catch { /* invalid url → 빈 값 */ }
    }

    // Imported clips go to "Saved Clips" (no folder) by default
    // to avoid folderId mismatch across Chrome profiles.
    const folderId = null;

    cleaned.push({ title, date, body, summary, summarySource, keywords, folderId, url, savedAt });
  }

  return { cleaned, skipped };
}

// 가져올 클립과 기존 클립 비교해 중복 분리 (UI 비의존, viewer/settings 공용)
// Same title+url is treated as duplicate. URL-less clips dedupe by title only
// (key becomes "title|||" which matches consistently across url-less clips).
function dedupeClipsAgainstExisting(cleaned, existingClips) {
  const keyOf = (c) => `${(c.title || "").trim()}|||${(c.url || "").trim()}`;
  const existingKeys = new Set(existingClips.map(keyOf));

  const newClips = [];
  const dupClips = [];
  for (const clip of cleaned) {
    const key = keyOf(clip);
    if (existingKeys.has(key)) {
      dupClips.push(clip);
    } else {
      newClips.push(clip);
      existingKeys.add(key); // 같은 파일 안의 중복도 스킵
    }
  }
  return { newClips, dupClips };
}

// 폴더 삭제 + 해당 폴더의 클립을 저장한 클립(folderId=null)으로 옮김. 한 트랜잭션으로 atomic 처리
async function deleteFolder(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, FOLDERS], 'readwrite');
    const clipsStore = tx.objectStore(STORE);
    const foldersStore = tx.objectStore(FOLDERS);

    const idx = clipsStore.index('folderId');
    const getReq = idx.getAll(IDBKeyRange.only(id));
    getReq.onsuccess = () => {
      for (const clip of getReq.result) {
        clip.folderId = null;
        clipsStore.put(clip);
      }
    };

    foldersStore.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
