// Lokale Datenbank (IndexedDB). Alles bleibt auf dem Gerät.
// Aufbau ist schon für spätere Schritte gedacht:
//   subjects  = Schulfächer (Schritt 2)
//   books     = Bücher / Mappen in einem Fach (Schritt 2+3)
//   pages     = Seiten-Infos (klein, schnell zu laden)
//   images    = Bild der Seite (Blob, groß)
//   thumbs    = kleines Vorschaubild (Blob)
//   ink       = Pencil-Notizen pro Seite (Schritt 4, noch leer)

const DB_NAME = 'lernapp';
const DB_VERSION = 4;   // 2: Hausaufgaben, Lernkarten · 3: Code-Projekte · 4: Erinnerungen
export const INBOX_BOOK = 'inbox';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('subjects')) db.createObjectStore('subjects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('books')) {
        const b = db.createObjectStore('books', { keyPath: 'id' });
        b.createIndex('subjectId', 'subjectId');
      }
      if (!db.objectStoreNames.contains('pages')) {
        const p = db.createObjectStore('pages', { keyPath: 'id' });
        p.createIndex('bookId', 'bookId');
      }
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs');
      if (!db.objectStoreNames.contains('ink')) db.createObjectStore('ink');
      // Version 2
      if (!db.objectStoreNames.contains('homework')) db.createObjectStore('homework', { keyPath: 'id' }).createIndex('subjectId', 'subjectId');
      if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' }).createIndex('subjectId', 'subjectId');
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId');
      // Version 3
      if (!db.objectStoreNames.contains('code')) db.createObjectStore('code', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reminders')) db.createObjectStore('reminders', { keyPath: 'id' });
    };
    req.onblocked = () => console.warn('Datenbank: alte Version noch in einem anderen Tab offen');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Abgebrochen'));
  });
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function addPage({ bookId = INBOX_BOOK, image, thumb, width, height }) {
  const db = await openDB();
  const existing = await listPages(bookId);
  const page = {
    id: newId(),
    bookId,
    index: existing.length,
    created: Date.now(),
    width, height,
    size: image.size,
    type: image.type,
    kind: 'scan',
  };
  const tx = db.transaction(['pages', 'images', 'thumbs'], 'readwrite');
  tx.objectStore('pages').put(page);
  tx.objectStore('images').put(image, page.id);
  tx.objectStore('thumbs').put(thumb, page.id);
  await done(tx);
  return page;
}

export async function listPages(bookId = INBOX_BOOK) {
  const db = await openDB();
  const tx = db.transaction('pages');
  const pages = await reqP(tx.objectStore('pages').index('bookId').getAll(bookId));
  return pages.sort((a, b) => a.index - b.index || a.created - b.created);
}

export async function getThumb(id) {
  const db = await openDB();
  return reqP(db.transaction('thumbs').objectStore('thumbs').get(id));
}

export async function getImage(id) {
  const db = await openDB();
  return reqP(db.transaction('images').objectStore('images').get(id));
}

export async function deletePage(id) {
  const db = await openDB();
  const tx = db.transaction(['pages', 'images', 'thumbs', 'ink'], 'readwrite');
  for (const s of ['pages', 'images', 'thumbs', 'ink']) tx.objectStore(s).delete(id);
  await done(tx);
}

// Bittet den Browser, die Daten nicht automatisch zu löschen.
export async function askPersistent() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* egal */ }
  return false;
}

export async function storageInfo() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
  } catch (e) { /* egal */ }
  return null;
}

// ---------- Leere Blätter und Pencil-Striche ----------
// paper: 'grid' (kariert), 'lined' (liniert), 'blank' (weiß)
export async function addBlankPage({ bookId = INBOX_BOOK, paper, thumb }) {
  const db = await openDB();
  const existing = await listPages(bookId);
  const page = {
    id: newId(), bookId, index: existing.length, created: Date.now(),
    kind: 'blank', paper, width: 1000, height: 1414, size: 0,
  };
  const tx = db.transaction(['pages', 'thumbs', 'ink'], 'readwrite');
  tx.objectStore('pages').put(page);
  if (thumb) tx.objectStore('thumbs').put(thumb, page.id);
  tx.objectStore('ink').put([], page.id);
  await done(tx);
  return page;
}

export async function getInk(id) {
  const db = await openDB();
  return (await reqP(db.transaction('ink').objectStore('ink').get(id))) || [];
}

// Speichert Striche + neue Vorschau in einem Schritt.
export async function saveInk(id, strokes, thumb) {
  const db = await openDB();
  const tx = db.transaction(['ink', 'thumbs', 'pages'], 'readwrite');
  tx.objectStore('ink').put(strokes, id);
  if (thumb) tx.objectStore('thumbs').put(thumb, id);
  const ps = tx.objectStore('pages');
  const r = ps.get(id);
  r.onsuccess = () => { const p = r.result; if (p) { p.edited = Date.now(); p.strokes = strokes.length; p.textBoxes = strokes.filter((x) => x.tool === 'text').map((x) => x.text).join('\n'); ps.put(p); } };
  await done(tx);
}

// ---------- Fächer und Bücher (Schritt 2) ----------
async function getAll(store, index, key) {
  const db = await openDB();
  const s = db.transaction(store).objectStore(store);
  return reqP(index ? s.index(index).getAll(key) : s.getAll());
}

export async function listSubjects() {
  return (await getAll('subjects')).sort((a, b) => (a.order ?? a.created) - (b.order ?? b.created));
}
export async function addSubject({ name, color }) {
  const db = await openDB();
  const s = { id: newId(), name, color, created: Date.now(), order: Date.now() };
  const tx = db.transaction('subjects', 'readwrite');
  tx.objectStore('subjects').put(s);
  await done(tx);
  return s;
}
export async function updateSubject(id, patch) {
  const db = await openDB();
  const tx = db.transaction('subjects', 'readwrite');
  const st = tx.objectStore('subjects');
  const r = st.get(id);
  r.onsuccess = () => { if (r.result) st.put({ ...r.result, ...patch }); };
  await done(tx);
}

// kind: 'book' (Buch), 'notebook' (Heft), 'folder' (Mappe)
export async function listBooks(subjectId) {
  return (await getAll('books', 'subjectId', subjectId)).sort((a, b) => a.created - b.created);
}
export async function listAllBooks() { return getAll('books'); }
export async function getBook(id) {
  const db = await openDB();
  return reqP(db.transaction('books').objectStore('books').get(id));
}
export async function addBook({ subjectId, title, kind = 'book', paper = 'lined' }) {
  const db = await openDB();
  const b = { id: newId(), subjectId, title, kind, paper, created: Date.now() };
  const tx = db.transaction('books', 'readwrite');
  tx.objectStore('books').put(b);
  await done(tx);
  return b;
}
export async function updateBook(id, patch) {
  const db = await openDB();
  const tx = db.transaction('books', 'readwrite');
  const st = tx.objectStore('books');
  const r = st.get(id);
  r.onsuccess = () => { if (r.result) st.put({ ...r.result, ...patch }); };
  await done(tx);
}

export async function listAllPages() { return getAll('pages'); }
export async function updatePage(id, patch) {
  const db = await openDB();
  const tx = db.transaction('pages', 'readwrite');
  const st = tx.objectStore('pages');
  const r = st.get(id);
  r.onsuccess = () => { if (r.result) { const v = { ...r.result, ...patch }; for (const k in patch) if (patch[k] == null) delete v[k]; st.put(v); } };
  await done(tx);
}

// ---------- Hausaufgaben und Lernkarten (einfache Listen) ----------
// homework: { id, subjectId, text, due: 'JJJJ-MM-TT', done, created }
// decks:    { id, subjectId, title, lang, created }
// cards:    { id, deckId, front, back, box (0-6), due (Zeitpunkt), created, right, wrong }
export const listHomework = (subjectId) => (subjectId ? getAll('homework', 'subjectId', subjectId) : getAll('homework'));
export const listDecks = (subjectId) => (subjectId ? getAll('decks', 'subjectId', subjectId) : getAll('decks'));
export const listCode = () => getAll('code');
export const listReminders = () => getAll('reminders');
export const listCards = (deckId) => (deckId ? getAll('cards', 'deckId', deckId) : getAll('cards'));
export async function putItems(store, items) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  for (const it of [].concat(items)) { if (!it.id) it.id = newId(); if (!it.created) it.created = Date.now(); tx.objectStore(store).put(it); }
  await done(tx);
  return items;
}
export async function deleteItems(store, ids) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  for (const id of [].concat(ids)) tx.objectStore(store).delete(id);
  await done(tx);
}
export async function deleteDeck(id) {
  const cards = await listCards(id);
  await deleteItems('cards', cards.map((c) => c.id));
  await deleteItems('decks', id);
}

async function deletePagesOf(bookIds) {
  const db = await openDB();
  const all = await listAllPages();
  const ids = all.filter((p) => bookIds.includes(p.bookId)).map((p) => p.id);
  const tx = db.transaction(['pages', 'images', 'thumbs', 'ink'], 'readwrite');
  for (const id of ids) for (const s of ['pages', 'images', 'thumbs', 'ink']) tx.objectStore(s).delete(id);
  await done(tx);
  return ids.length;
}
export async function deleteBook(id) {
  await deletePagesOf([id]);
  const db = await openDB();
  const tx = db.transaction('books', 'readwrite');
  tx.objectStore('books').delete(id);
  await done(tx);
}
export async function deleteSubject(id) {
  const books = await listBooks(id);
  await deletePagesOf(books.map((b) => b.id));
  const db = await openDB();
  const tx = db.transaction(['books', 'subjects'], 'readwrite');
  for (const b of books) tx.objectStore('books').delete(b.id);
  tx.objectStore('subjects').delete(id);
  await done(tx);
  const [hw, decks] = await Promise.all([listHomework(id), listDecks(id)]);
  await deleteItems('homework', hw.map((x) => x.id));
  for (const d of decks) await deleteDeck(d.id);
  const refs = new Set([...hw.map((x) => x.id), ...decks.map((d) => d.id)]);
  await deleteItems('reminders', (await listReminders()).filter((r) => refs.has(r.refId) || r.subjectId === id).map((r) => r.id));
}

// Reihenfolge der Seiten eines Buches neu speichern (ids in neuer Reihenfolge)
export async function setOrder(bookId, ids) {
  const db = await openDB();
  const tx = db.transaction('pages', 'readwrite');
  const st = tx.objectStore('pages');
  ids.forEach((id, index) => {
    const r = st.get(id);
    r.onsuccess = () => { if (r.result) st.put({ ...r.result, bookId, index }); };
  });
  await done(tx);
}

// Seiten in ein anderes Buch verschieben (hinten anhängen)
export async function movePages(ids, toBookId) {
  const target = await listPages(toBookId);
  const all = await listAllPages();
  const fromBooks = new Set(all.filter((p) => ids.includes(p.id)).map((p) => p.bookId));
  await setOrder(toBookId, [...target.map((p) => p.id), ...ids.filter((id) => !target.some((p) => p.id === id))]);
  for (const b of fromBooks) {
    if (b === toBookId) continue;
    const rest = (await listPages(b)).filter((p) => !ids.includes(p.id));
    await setOrder(b, rest.map((p) => p.id));
  }
}

// ---------- Sicherung ----------
function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
function b64ToBlob(b64, type) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

// Alles in ein Objekt (Bilder als Base64). onProgress(fertig, gesamt)
export async function exportAll(onProgress = () => {}) {
  const [subjects, books, pages] = await Promise.all([listSubjects(), listAllBooks(), listAllPages()]);
  const [homework, decks, cards, code, reminders] = await Promise.all([listHomework(), listDecks(), listCards(), listCode(), listReminders()]);
  const out = { app: 'lernapp', version: 4, created: new Date().toISOString(), subjects, books, pages, homework, decks, cards, code, reminders, images: {}, thumbs: {}, ink: {} };
  let i = 0;
  for (const p of pages) {
    const [img, th, ink] = await Promise.all([getImage(p.id), getThumb(p.id), getInk(p.id)]);
    if (img) out.images[p.id] = await blobToB64(img);
    if (th) out.thumbs[p.id] = await blobToB64(th);
    if (ink && ink.length) out.ink[p.id] = ink;
    onProgress(++i, pages.length);
  }
  return out;
}

// Sicherung einspielen. Vorhandenes bleibt, gleiche Einträge werden überschrieben.
export async function importAll(data) {
  if (!data || data.app !== 'lernapp' || !Array.isArray(data.pages)) throw new Error('Das ist keine Sicherung dieser App.');
  const db = await openDB();
  const tx = db.transaction(['subjects', 'books', 'pages', 'images', 'thumbs', 'ink', 'homework', 'decks', 'cards', 'code', 'reminders'], 'readwrite');
  for (const st of ['homework', 'decks', 'cards', 'code', 'reminders']) for (const it of data[st] || []) tx.objectStore(st).put(it);
  for (const s of data.subjects || []) tx.objectStore('subjects').put(s);
  for (const b of data.books || []) tx.objectStore('books').put(b);
  for (const p of data.pages) {
    tx.objectStore('pages').put(p);
    if (data.images && data.images[p.id]) tx.objectStore('images').put(b64ToBlob(data.images[p.id], p.type || 'image/jpeg'), p.id);
    if (data.thumbs && data.thumbs[p.id]) tx.objectStore('thumbs').put(b64ToBlob(data.thumbs[p.id], 'image/jpeg'), p.id);
    tx.objectStore('ink').put((data.ink && data.ink[p.id]) || [], p.id);
  }
  await done(tx);
  return { subjects: (data.subjects || []).length, books: (data.books || []).length, pages: data.pages.length, cards: (data.cards || []).length };
}
