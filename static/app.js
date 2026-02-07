import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const GUEST = new URLSearchParams(window.location.search).get('guest') === '1';
let auth = null;
let db = null;
if (!GUEST) {
  try {
    const res = await fetch('/firebase-config');
    const cfg = await res.json();
    if (!res.ok || !cfg.apiKey || !cfg.projectId) {
      console.warn('Firebase config missing or incomplete', cfg.error || cfg);
      throw new Error(cfg.message || 'CONFIGURATION_NOT_FOUND');
    }
    const app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error('Firebase init failed', e);
  }
}

const authView = document.getElementById('auth');
const chatView = document.getElementById('chat');
const userSpan = document.getElementById('user');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const messages = document.getElementById('messages');
const questionInput = document.getElementById('question');
const sendBtn = document.getElementById('sendBtn');
const nowTs = () => new Date().toLocaleTimeString();
const renderUserMsg = (text, ts) => {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const t = document.createElement('div');
  t.className = 'text';
  t.textContent = text;
  const m = document.createElement('div');
  m.className = 'meta';
  m.textContent = ts || nowTs();
  bubble.appendChild(t);
  bubble.appendChild(m);
  wrap.appendChild(bubble);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
};
const renderBotMsg = (text, ts) => {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const t = document.createElement('div');
  t.className = 'text';
  t.textContent = text;
  const m = document.createElement('div');
  m.className = 'meta';
  m.textContent = ts || nowTs();
  bubble.appendChild(t);
  bubble.appendChild(m);
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
};
const renderBotLoading = () => {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot loading';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const t = document.createElement('div');
  t.className = 'text';
  t.innerHTML = '<span class="spinner"></span>正在生成...';
  const m = document.createElement('div');
  m.className = 'meta';
  m.textContent = nowTs();
  bubble.appendChild(t);
  bubble.appendChild(m);
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
  return { wrap, bubble, t };
};
const typeText = async (el, text) => {
  el.textContent = '';
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    await new Promise(r => setTimeout(r, 8));
  }
};


const saveChat = async (question, answer, error) => {
  if (GUEST || !auth || !auth.currentUser || !db) return;
  const uid = auth.currentUser.uid;
  const col = collection(db, 'users', uid, 'chats');
  const payload = { question, answer: answer || '', error: error || '', createdAt: serverTimestamp() };
  try { await addDoc(col, payload); } catch {}
};

document.getElementById('signin').addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) return;
  await signInWithEmailAndPassword(auth, email, password);
});

document.getElementById('signup').addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) return;
  await createUserWithEmailAndPassword(auth, email, password);
});

document.getElementById('signout').addEventListener('click', async () => {
  if (GUEST) return;
  await signOut(auth);
});

if (GUEST) {
  userSpan.textContent = 'Guest';
  authView.classList.add('hidden');
  chatView.classList.remove('hidden');
  document.getElementById('signout').style.display = 'none';
} else {
  onAuthStateChanged(auth, user => {
    if (user) {
      userSpan.textContent = user.email || user.uid;
      authView.classList.add('hidden');
      chatView.classList.remove('hidden');
      loadHistory();
    } else {
      userSpan.textContent = '';
      chatView.classList.add('hidden');
      authView.classList.remove('hidden');
      messages.innerHTML = '';
    }
  });
}

document.getElementById('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = questionInput.value.trim();
  if (!q) return;
  renderUserMsg(q);
  questionInput.value = '';
  sendBtn.disabled = true;
  sendBtn.textContent = '发送中...';
  questionInput.disabled = true;
  const { wrap, bubble, t } = renderBotLoading();
  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q })
    });
    const data = await res.json();
    const body = Array.isArray(data) ? (data[0] || {}) : data;
    const text = body.answer || body.error || '请求失败';
    wrap.classList.remove('loading');
    await typeText(t, text);
    await saveChat(q, body.answer || '', body.error || '');
  } catch (err) {
    wrap.classList.remove('loading');
    const msg = '请求错误';
    t.textContent = msg;
    await saveChat(q, '', msg);
  }
  sendBtn.disabled = false;
  sendBtn.textContent = '发送';
  questionInput.disabled = false;
});
const loadHistory = async () => {
  if (!auth || !auth.currentUser || !db) return;
  messages.innerHTML = '';
  const uid = auth.currentUser.uid;
  const col = collection(db, 'users', uid, 'chats');
  const q = query(col, orderBy('createdAt', 'asc'), limit(100));
  try {
    const snap = await getDocs(q);
    snap.forEach(doc => {
      const d = doc.data() || {};
      const ts = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleTimeString() : nowTs();
      if (d.question) renderUserMsg(d.question, ts);
      const text = d.answer || d.error || '';
      if (text) renderBotMsg(text, ts);
    });
  } catch {}
};