/* ===== Спільний код для всіх сторінок сайту ===== */

/* ---- Firebase config — встав свої значення СЮДИ ОДИН РАЗ, для всіх сторінок ---- */
const firebaseConfig = {
  apiKey: "AIzaSyDBsSNsFXlFymLW9VwB_TLBsKnqsR_GcPM",
  authDomain: "yarosfactory-movies.firebaseapp.com",
  projectId: "yarosfactory-movies",
  storageBucket: "yarosfactory-movies.firebasestorage.app",
  messagingSenderId: "616449635479",
  appId: "1:616449635479:web:46a2f16bcc1e2e8b85a5d2"
};

let db = null;
let firebaseReady = false;
try{
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  firebaseReady = true;
}catch(e){
  console.warn('Firebase не налаштовано:', e.message);
}

const REACTION_EMOJIS = [
  { key:'fire', emoji:'🔥' },
  { key:'heart', emoji:'❤️' },
  { key:'laugh', emoji:'😂' },
  { key:'sad', emoji:'😢' },
  { key:'sick', emoji:'🤢' }
];

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
function fmtDateLong(d){
  const dt = new Date(d);
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('uk-UA', { day:'numeric', month:'long', year:'numeric' });
}
function fmtDateShort(d){
  const dt = new Date(d);
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('uk-UA', { day:'numeric', month:'short' });
}
function todayStr(){
  const t = new Date();
  return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
}
function statusOf(m){
  if(m.__placeholder) return 'today-empty';
  if(m.watched === todayStr()) return 'today';
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(m.watched) < today ? 'watched' : 'planned';
}
function ratingBar(rating){
  let out = '<div class="bar">';
  for(let i=1;i<=10;i++){ out += `<span class="${i<=rating ? 'filled':''}"></span>`; }
  out += '</div>';
  return out;
}
function slugify(str){
  return (str || 'movie')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'movie';
}
function movieId(m){ return m.id || slugify(m.title); }
function genresOf(m){
  if(!m.genre) return [];
  return Array.isArray(m.genre) ? m.genre.filter(Boolean) : [m.genre];
}

/* ---- Оцінка глядачів (1-10): container — DOM-елемент, movie — об'єкт фільму ---- */
function renderViewerRating(container, movie){
  if(!firebaseReady){
    container.innerHTML = '';
    return;
  }
  const id = movieId(movie);
  const docRef = db.collection('reactions').doc(id);
  const myKey = 'myRating:' + id;
  let myRating = parseInt(localStorage.getItem(myKey) || '0', 10) || 0;

  container.innerHTML = `
    <div class="viewer-rating">
      <h3>Оцінка глядачів</h3>
      <div class="rating-avg" id="ratingAvg">Ще немає оцінок</div>
      <div class="rate-hint">${myRating ? 'Твоя оцінка — можеш змінити:' : 'Постав свою оцінку:'}</div>
      <div class="rate-picker" id="ratePicker">
        ${Array.from({length:10}, (_, i) => i + 1).map(n => `<button type="button" data-val="${n}">${n}</button>`).join('')}
      </div>
    </div>
  `;

  const avgEl = document.getElementById('ratingAvg');
  const picker = document.getElementById('ratePicker');
  const buttons = [...picker.querySelectorAll('button')];

  function paint(highlight){
    buttons.forEach(b => b.classList.toggle('active', parseInt(b.dataset.val, 10) <= highlight));
  }
  paint(myRating);

  picker.addEventListener('mouseover', (e) => {
    const val = e.target.dataset.val;
    if(val) paint(parseInt(val, 10));
  });
  picker.addEventListener('mouseleave', () => paint(myRating));

  docRef.onSnapshot(snap => {
    const data = snap.exists ? snap.data() : {};
    const sum = data.ratingSum || 0;
    const count = data.ratingCount || 0;
    avgEl.textContent = count > 0
      ? `${(sum / count).toFixed(1)} / 10 · ${count} ${count === 1 ? 'оцінка' : 'оцінок'}`
      : 'Ще немає оцінок';
  }, err => console.warn('Помилка Firestore (rating):', err.message));

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const newVal = parseInt(btn.dataset.val, 10);
      const oldVal = myRating;
      if(newVal === oldVal) return;
      myRating = newVal;
      localStorage.setItem(myKey, String(newVal));
      paint(newVal);
      container.querySelector('.rate-hint').textContent = 'Твоя оцінка — можеш змінити:';

      db.runTransaction(tx => {
        return tx.get(docRef).then(snap => {
          const data = snap.exists ? snap.data() : {};
          const sum = data.ratingSum || 0;
          const count = data.ratingCount || 0;
          const newSum = oldVal ? (sum - oldVal + newVal) : (sum + newVal);
          const newCount = oldVal ? count : count + 1;
          tx.set(docRef, { ratingSum: newSum, ratingCount: newCount }, { merge: true });
        });
      }).catch(err => console.warn('Не вдалося зберегти оцінку:', err.message));
    });
  });
}

/* ---- Реакції: container — DOM-елемент, movie — об'єкт фільму з movies.json ---- */
function renderReactions(container, movie){
  if(!firebaseReady){
    container.innerHTML = `<div class="comments-loading">Реакції глядачів вимкнено — не налаштовано Firebase.</div>`;
    return;
  }
  const id = movieId(movie);
  const docRef = db.collection('reactions').doc(id);
  const reactedKey = 'reacted:' + id;
  let reactedSet = new Set();
  try{ reactedSet = new Set(JSON.parse(localStorage.getItem(reactedKey) || '[]')); }catch(e){}

  container.innerHTML = `<div class="reactions">${REACTION_EMOJIS.map(r => `
    <button class="reaction-btn ${reactedSet.has(r.key) ? 'reacted' : ''}" data-key="${r.key}">
      <span class="emoji">${r.emoji}</span>
      <span class="count" id="count-${r.key}">0</span>
    </button>
  `).join('')}</div>`;

  docRef.onSnapshot(snap => {
    const data = snap.exists ? snap.data() : {};
    REACTION_EMOJIS.forEach(r => {
      const el = document.getElementById('count-' + r.key);
      if(el) el.textContent = data[r.key] || 0;
    });
  }, err => console.warn('Помилка Firestore (reactions):', err.message));

  container.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if(reactedSet.has(key)) return;
      reactedSet.add(key);
      localStorage.setItem(reactedKey, JSON.stringify([...reactedSet]));
      btn.classList.add('reacted');
      docRef.set({ [key]: firebase.firestore.FieldValue.increment(1) }, { merge: true })
        .catch(err => console.warn('Не вдалося зберегти реакцію:', err.message));
    });
  });
}

/* ---- Коментарі: container — DOM-елемент, movie — об'єкт фільму з movies.json ---- */
function renderComments(container, movie){
  if(!firebaseReady){
    container.innerHTML = '';
    return;
  }
  const id = movieId(movie);
  const colRef = db.collection('reactions').doc(id).collection('comments');

  container.innerHTML = `
    <div class="comments">
      <h3>Коментарі глядачів</h3>
      <form class="comment-form" id="commentForm">
        <input type="text" id="commentName" placeholder="Ім'я (необов'язково)" maxlength="40">
        <textarea id="commentText" placeholder="Що думаєш про цей фільм?" rows="3" maxlength="400" required></textarea>
        <div class="comment-hint">До 400 символів. Коментарі видно всім глядачам сайту.</div>
        <button type="submit">Надіслати</button>
      </form>
      <div class="comment-list" id="commentList"><div class="comments-loading">Завантаження…</div></div>
    </div>
  `;

  const form = document.getElementById('commentForm');
  const nameInput = document.getElementById('commentName');
  const textInput = document.getElementById('commentText');
  const listEl = document.getElementById('commentList');
  const submitBtn = form.querySelector('button');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = textInput.value.trim();
    if(!text) return;
    submitBtn.disabled = true;
    colRef.add({
      name: nameInput.value.trim().slice(0, 40) || 'Глядач',
      text: text.slice(0, 400),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      textInput.value = '';
    }).catch(err => {
      console.warn('Не вдалося надіслати коментар:', err.message);
    }).finally(() => {
      submitBtn.disabled = false;
    });
  });

  colRef.orderBy('createdAt', 'desc').limit(50).onSnapshot(snap => {
    if(snap.empty){
      listEl.innerHTML = `<div class="comments-empty">Ще немає коментарів — стань першим.</div>`;
      return;
    }
    listEl.innerHTML = snap.docs.map(doc => {
      const c = doc.data();
      const dateStr = c.createdAt && c.createdAt.toDate ? fmtDateShort(c.createdAt.toDate()) : '';
      return `
        <div class="comment-item">
          <div class="c-head">
            <span class="c-name">${escapeHtml(c.name || 'Глядач')}</span>
            <span class="c-date">${dateStr}</span>
          </div>
          <div class="c-text">${escapeHtml(c.text || '')}</div>
        </div>
      `;
    }).join('');
  }, err => {
    console.warn('Помилка Firestore (comments):', err.message);
    listEl.innerHTML = `<div class="comments-empty">Не вдалося завантажити коментарі.</div>`;
  });
}
