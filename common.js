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

/* ---- Спільні GitHub-хелпери (add-movie.html, movie.html — редагування) ---- */
const GH_LS_KEYS = { token:'am_gh_token', owner:'am_gh_owner', repo:'am_gh_repo', path:'am_gh_path', branch:'am_gh_branch' };

function ghSettings(){
  return {
    token: localStorage.getItem(GH_LS_KEYS.token) || '',
    owner: localStorage.getItem(GH_LS_KEYS.owner) || 'yarosfactory-twitch',
    repo: localStorage.getItem(GH_LS_KEYS.repo) || 'movies',
    path: localStorage.getItem(GH_LS_KEYS.path) || 'movies.json',
    branch: localStorage.getItem(GH_LS_KEYS.branch) || 'main'
  };
}

function decodeBase64Utf8(b64){
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}
function encodeBase64Utf8(str){
  return btoa(unescape(encodeURIComponent(str)));
}

/* transformFn(arr) -> new/mutated array. Повертає новий вміст movies.json (рядок). */
async function commitMoviesArray(transformFn, commitMessage, onRetry, maxAttempts = 3){
  const { token, owner, repo, path, branch } = ghSettings();
  if(!token) throw new Error('Немає GitHub-токена. Введи його на сторінці add-movie.html.');

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json' };

  for(let attempt = 1; attempt <= maxAttempts; attempt++){
    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    if(!getRes.ok){
      if(getRes.status === 401) throw new Error('Токен недійсний або прострочений.');
      if(getRes.status === 404) throw new Error('Файл або репозиторій не знайдено.');
      throw new Error(`Помилка читання файлу (${getRes.status}).`);
    }
    const getData = await getRes.json();
    const currentContent = decodeBase64Utf8(getData.content);
    let arr;
    try{
      arr = JSON.parse(currentContent);
    }catch(e){
      throw new Error('movies.json пошкоджений або не є валідним JSON.');
    }
    if(!Array.isArray(arr)) throw new Error('movies.json має бути масивом.');

    arr = transformFn(arr);
    const newContent = JSON.stringify(arr, null, 2) + '\n';

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: commitMessage, content: encodeBase64Utf8(newContent), sha: getData.sha, branch })
    });

    if(putRes.ok) return newContent;

    if(putRes.status === 409 && attempt < maxAttempts){
      if(onRetry) onRetry(attempt + 1, maxAttempts);
      continue;
    }
    if(putRes.status === 409) throw new Error('Файл змінюється надто часто паралельно — спробуй ще раз за кілька секунд.');
    if(putRes.status === 403) throw new Error('Токену бракує прав на запис (Contents: Read and write).');
    throw new Error(`Помилка запису (${putRes.status}).`);
  }
}

/* ---- Twitch-логін (Implicit OAuth, без бекенда) ---- */
const TWITCH_CLIENT_ID = "w30prbyn4afxt1d1j3n7d1lxttrpub";
const TWITCH_OWNER_LOGIN = "yarosfactory";

/* ---- TMDB (пошук фільмів для форми пропозицій) ---- */
const TMDB_API_KEY = "7c2b3da6976f16ca5acc1b80122966bd";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w220_and_h330_face";

async function tmdbSearchMovies(query){
  if(!query || !query.trim()) return [];
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=uk-UA&query=${encodeURIComponent(query.trim())}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Помилка TMDB (' + res.status + ')');
  const data = await res.json();
  return (data.results || []).map(r => ({
    id: r.id,
    title: r.title || r.original_title || '',
    year: r.release_date ? parseInt(r.release_date.slice(0, 4), 10) : null,
    poster: r.poster_path ? TMDB_IMG_BASE + r.poster_path : '',
    overview: r.overview || ''
  }));
}

async function tmdbGetMovieDetails(id){
  const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=uk-UA`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Помилка TMDB (' + res.status + ')');
  const data = await res.json();
  return {
    id: data.id,
    title: data.title || data.original_title || '',
    year: data.release_date ? parseInt(data.release_date.slice(0, 4), 10) : null,
    poster: data.poster_path ? TMDB_IMG_BASE + data.poster_path : '',
    genre: (data.genres || []).map(g => g.name),
    note: data.overview || ''
  };
}

function twitchRedirectUri(){
  const path = window.location.pathname;
  const base = path.slice(0, path.lastIndexOf('/') + 1);
  return window.location.origin + base + 'index.html';
}
function twitchLoginUrl(){
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: twitchRedirectUri(),
    response_type: 'token',
    scope: ''
  });
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}
function getTwitchUser(){
  try{ return JSON.parse(localStorage.getItem('twitch_user') || 'null'); }catch(e){ return null; }
}
function twitchLogout(){
  localStorage.removeItem('twitch_user');
  window.location.reload();
}

async function handleTwitchCallback(){
  if(!window.location.hash.includes('access_token')) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token');
  history.replaceState(null, '', window.location.pathname + window.location.search);
  if(!accessToken) return;
  try{
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID }
    });
    const data = await res.json();
    const user = data.data && data.data[0];
    if(user){
      localStorage.setItem('twitch_user', JSON.stringify({
        login: user.login, display_name: user.display_name, id: user.id
      }));
    }
  }catch(e){
    console.warn('Помилка Twitch-авторизації:', e.message);
  }
}

function renderAuthWidget(container){
  const user = getTwitchUser();
  if(user){
    const ownerLink = user.login === TWITCH_OWNER_LOGIN ? `<a href="add-movie.html">➕ Додати фільм</a>` : '';
    container.innerHTML = `
      <div class="auth-widget">
        <span class="auth-name">👋 ${escapeHtml(user.display_name)}</span>
        <a href="my-orders.html">Мої замовлення</a>
        <a href="my-wishlist.html">Моє бажане</a>
        ${ownerLink}
        <button type="button" class="auth-logout" onclick="twitchLogout()">Вийти</button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="auth-widget">
        <a class="auth-login" href="${twitchLoginUrl()}">Увійти через Twitch</a>
      </div>
    `;
  }
}

async function initAuth(container){
  if(!container) return;
  await handleTwitchCallback();
  renderAuthWidget(container);
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
  const confirmedKey = 'myRatingConfirmed:' + id;
  let myRating = parseInt(localStorage.getItem(myKey) || '0', 10) || 0;
  let confirmed = myRating > 0 && localStorage.getItem(confirmedKey) === '1';

  container.innerHTML = `
    <div class="viewer-rating">
      <h3>Оцінка глядачів</h3>
      <div class="rating-avg" id="ratingAvg">Ще немає оцінок</div>
      <div class="rate-hint" id="rateHint">${confirmed ? 'Твоя оцінка — можеш змінити:' : 'Постав свою оцінку:'}</div>
      <div class="rate-picker" id="ratePicker">
        ${Array.from({length:10}, (_, i) => i + 1).map(n => `<button type="button" data-val="${n}">${n}</button>`).join('')}
      </div>
    </div>
  `;

  const avgEl = document.getElementById('ratingAvg');
  const hintEl = document.getElementById('rateHint');
  const picker = document.getElementById('ratePicker');
  const buttons = [...picker.querySelectorAll('button')];

  function paint(highlight){
    buttons.forEach(b => b.classList.toggle('active', parseInt(b.dataset.val, 10) <= highlight));
  }
  paint(confirmed ? myRating : 0);

  picker.addEventListener('mouseover', (e) => {
    const val = e.target.dataset.val;
    if(val) paint(parseInt(val, 10));
  });
  picker.addEventListener('mouseleave', () => paint(confirmed ? myRating : 0));

  docRef.onSnapshot(snap => {
    const data = snap.exists ? snap.data() : {};
    const sum = data.ratingSum || 0;
    const count = data.ratingCount || 0;
    const rawAvg = count > 0 ? sum / count : 0;
    const avg = Math.min(10, Math.max(1, rawAvg)); // захист від зіпсованих старих даних
    avgEl.textContent = count > 0
      ? `${avg.toFixed(1)} / 10 · ${count} ${count === 1 ? 'оцінка' : 'оцінок'}`
      : 'Ще немає оцінок';
  }, err => console.warn('Помилка Firestore (rating):', err.message));

  let isSaving = false;

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      if(isSaving) return;
      const newVal = Math.min(10, Math.max(1, parseInt(btn.dataset.val, 10) || 0));
      if(confirmed && newVal === myRating) return;
      const wasConfirmed = confirmed;
      const oldVal = wasConfirmed ? Math.min(10, Math.max(0, myRating || 0)) : 0;

      isSaving = true;
      paint(newVal);
      hintEl.textContent = 'Зберігаю…';
      buttons.forEach(b => b.disabled = true);

      db.runTransaction(tx => {
        return tx.get(docRef).then(snap => {
          const data = snap.exists ? snap.data() : {};
          const sum = data.ratingSum || 0;
          const count = data.ratingCount || 0;
          let newSum = wasConfirmed ? (sum - oldVal + newVal) : (sum + newVal);
          let newCount = wasConfirmed ? count : count + 1;
          // захист: сума й кількість ніколи не можуть бути від'ємними, а середнє — виходити за межі 1-10
          newCount = Math.max(0, newCount);
          newSum = Math.max(0, Math.min(newSum, newCount * 10));
          tx.set(docRef, { ratingSum: newSum, ratingCount: newCount }, { merge: true });
        });
      }).then(() => {
        myRating = newVal;
        confirmed = true;
        localStorage.setItem(myKey, String(newVal));
        localStorage.setItem(confirmedKey, '1');
        hintEl.textContent = 'Твоя оцінка — можеш змінити:';
      }).catch(err => {
        console.warn('Не вдалося зберегти оцінку:', err.message);
        paint(wasConfirmed ? myRating : 0);
        hintEl.textContent = 'Не вдалося зберегти — спробуй ще раз.';
      }).then(() => {
        // короткий кулдаун після кожної спроби — захист від автоклікерів і випадкових подвійних кліків
        setTimeout(() => {
          buttons.forEach(b => b.disabled = false);
          isSaving = false;
        }, 2500);
      });
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
  const twitchUser = getTwitchUser();

  container.innerHTML = `
    <div class="comments">
      <h3>Коментарі глядачів</h3>
      <form class="comment-form" id="commentForm">
        ${twitchUser
          ? `<div class="comment-as">Коментуєш як <strong>${escapeHtml(twitchUser.display_name)}</strong></div>`
          : `<input type="text" id="commentName" placeholder="Ім'я (необов'язково)" maxlength="40">`}
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
  const errEl = document.createElement('div');
  errEl.className = 'comment-error';
  errEl.style.display = 'none';
  form.insertBefore(errEl, submitBtn);

  function showCommentError(msg){
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
  function clearCommentError(){
    errEl.style.display = 'none';
  }

  const COMMENT_COOLDOWN_MS = 60000;
  function validateComment(text){
    const chars = Array.from(text);
    if(chars.length < 20){
      return 'Коментар має бути хоча б 20 символів.';
    }
    let runChar = null, runLen = 0;
    for(const ch of chars){
      if(ch === runChar){
        runLen++;
        if(runLen >= 5){
          return 'Забагато однакових символів підряд — напиши щось змістовне.';
        }
      } else {
        runChar = ch;
        runLen = 1;
      }
    }
    const lastAt = parseInt(localStorage.getItem('lastCommentAt') || '0', 10);
    const now = Date.now();
    if(now - lastAt < COMMENT_COOLDOWN_MS){
      const waitSec = Math.ceil((COMMENT_COOLDOWN_MS - (now - lastAt)) / 1000);
      return `Зачекай ще ${waitSec} с перед наступним коментарем.`;
    }
    return null;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearCommentError();
    const text = textInput.value.trim();
    if(!text) return;

    const err = validateComment(text);
    if(err){
      showCommentError(err);
      return;
    }

    submitBtn.disabled = true;
    const name = twitchUser ? twitchUser.display_name : (nameInput ? nameInput.value.trim().slice(0, 40) : '');
    colRef.add({
      name: name || 'Глядач',
      text: text.slice(0, 400),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      textInput.value = '';
      localStorage.setItem('lastCommentAt', String(Date.now()));
    }).catch(err => {
      console.warn('Не вдалося надіслати коментар:', err.message);
      showCommentError('Не вдалося надіслати — спробуй ще раз.');
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
