/* ─── Particle canvas background ─────────────────────────────── */
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let W, H, particles = [];

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

window.addEventListener('resize', () => { resize(); initParticles(); });
resize();

class Particle {
  constructor() { this.reset(true); }

  reset(initial = false) {
    this.x = Math.random() * W;
    this.y = initial ? Math.random() * H : H + 10;
    this.r = Math.random() * 1.5 + 0.3;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = -(Math.random() * 0.4 + 0.1);
    this.alpha = Math.random() * 0.5 + 0.1;
    this.color = ['#a78bfa', '#38bdf8', '#f472b6'][Math.floor(Math.random() * 3)];
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.y < -10) this.reset();
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.alpha;
    ctx.fill();
  }
}

function initParticles() {
  particles = Array.from({ length: 90 }, () => new Particle());
}

function animateCanvas() {
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  particles.forEach(p => { p.update(); p.draw(); });
  requestAnimationFrame(animateCanvas);
}

initParticles();
animateCanvas();


/* ─── State ───────────────────────────────────────────────────── */
let messageCount = 0;
let isTyping = false;
let activeController = null; // AbortController for the current stream
const STORAGE_KEY = "phi3_chat_history";

let sessions = {}
let activeSession = null



/* ─── Sidebar toggle ──────────────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}


/* ─── Chip suggestions ────────────────────────────────────────── */
function useChip(el) {
  const prompt = document.getElementById('prompt');
  prompt.value = el.textContent.replace(/^[^\s]+\s/, '').trim(); // strip emoji
  prompt.focus();
  updateCharCount();
  autoResize(prompt);
}


/* ─── Auto-resize textarea ────────────────────────────────────── */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}


/* ─── Char counter ────────────────────────────────────────────── */
function updateCharCount() {
  const prompt = document.getElementById('prompt');
  const counter = document.getElementById('char-count');
  const len = prompt.value.length;
  counter.textContent = len;
  counter.className = 'char-count' + (len > 800 ? ' limit' : len > 500 ? ' warn' : '');
}


/* ─── Keyboard send (Enter) ──────────────────────────────────── */
document.getElementById('prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById('prompt').addEventListener('input', function () {
  autoResize(this);
  updateCharCount();
});


/* ─── Send message ────────────────────────────────────────────── */
async function sendMessage() {
  if (isTyping) return;

  const promptEl = document.getElementById("prompt");
  const text = promptEl.value.trim();

  if (!text) return;

  const splash = document.getElementById("welcome-splash");
  if (splash) splash.remove();

  appendMessage(text, "user");

  promptEl.value = "";
  autoResize(promptEl);
  updateCharCount();

  // Create AI bubble with loading dots
  const aiWrap = appendMessage("...", "ai");
  const bubble = aiWrap.querySelector(".message");

  isTyping = true;
  setTypingStatus(true);
  setStopButton(true);

  activeController = new AbortController();

  try {
    const res = await fetch("http://127.0.0.1:8001/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt: text }),
      signal: activeController.signal
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let firstChunk = true;

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      // Replace dots immediately when first text arrives
      if (firstChunk) {
        bubble.textContent = "";
        firstChunk = false;
      }

      bubble.textContent += chunk;

      const chatBox = document.getElementById("chat-box");
      chatBox.scrollTop = chatBox.scrollHeight;

      saveChat();
    }

  } catch (error) {
    if (error.name === "AbortError") {
      // User stopped generation — keep whatever was streamed, just trim trailing dots
      if (bubble.textContent === "...") bubble.textContent = "";
    } else {
      bubble.textContent = "Error: Could not connect to backend.";
    }
  } finally {
    if (bubble.textContent.trim() === "...") return;
    activeController = null;
    isTyping = false;
    setTypingStatus(false);
    setStopButton(false);
  }
}


/* ─── Stop generation ─────────────────────────────────────────── */
function stopGeneration() {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
}

/* ─── Append a message ────────────────────────────────────────── */
function appendMessage(text, sender, shouldSave = true) {
  const chatBox = document.getElementById('chat-box');
  messageCount++;
  document.getElementById('msg-count').textContent = messageCount;

  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${sender}`;

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${sender}`;
  avatar.textContent = sender === 'ai' ? '✦' : '👤';

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = `message ${sender}`;
  bubble.textContent = text; // Plain text — extend with markdown parser if needed

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = now();

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(bubble.textContent);
    copyBtn.textContent = '✓ Copied';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
  };

  meta.append(time, copyBtn);

  // Assemble — avatar on outside, bubble+meta stacked
  const content = document.createElement('div');
  content.style.cssText = 'display:flex;flex-direction:column;gap:4px;' +
    (sender === 'user' ? 'align-items:flex-end;' : 'align-items:flex-start;');
  content.append(bubble, meta);

  wrapper.append(avatar, content);
  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (shouldSave) saveChat();

  return wrapper;
}


/* ─── Thinking indicator ──────────────────────────────────────── */
function appendThinking() {
  const chatBox = document.getElementById('chat-box');

  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper ai';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar ai';
  avatar.textContent = '✦';

  const bubble = document.createElement('div');
  bubble.className = 'message ai thinking-bubble';
  bubble.innerHTML = '<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>';

  wrapper.append(avatar, bubble);
  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;

  return wrapper;
}


/* ─── Typing status in header ─────────────────────────────────── */
function setTypingStatus(typing) {
  const el = document.getElementById('typing-status');
  if (typing) {
    el.textContent = 'Generating response…';
    el.classList.add('typing');
  } else {
    el.textContent = 'Ready to help you ✦';
    el.classList.remove('typing');
  }
}

/* ─── Show / hide stop button ─────────────────────────────────── */
function setStopButton(show) {
  document.getElementById('stop-btn').classList.toggle('visible', show);
  document.getElementById('stop-btn').classList.toggle('hidden', !show);
  document.getElementById('send-btn').classList.toggle('hidden', show);
  document.getElementById('send-btn').classList.toggle('visible', !show);
}


/* ─── Clear chat ──────────────────────────────────────────────── */
function clearChat() {
    sessions[activeSession] = []
    saveChat();
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';
    messageCount = 0;
    document.getElementById('msg-count').textContent = '0';

    // Re-add welcome splash
    const splash = document.createElement('div');
    splash.className = 'welcome-splash';
    splash.id = 'welcome-splash';
    splash.innerHTML = `
    <div class="splash-avatar">
      <div class="splash-ring-outer"></div>
      <div class="splash-ring-inner"></div>
      <div class="splash-icon">
        <svg viewBox="0 0 24 24" fill="none" width="36" height="36">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
    <h2>Hello, I'm Phi-3</h2>
    <p>Your intelligent AI assistant. Ask me anything — from coding to creative writing, analysis to conversation.</p>
    <div class="suggestion-chips">
      <button class="chip" onclick="useChip(this)">✨ Write me a poem</button>
      <button class="chip" onclick="useChip(this)">💡 Explain quantum computing</button>
      <button class="chip" onclick="useChip(this)">🐍 Write a Python function</button>
      <button class="chip" onclick="useChip(this)">📊 Help me analyze data</button>
    </div>
  `;
  chatBox.appendChild(splash);
}


/* ─── Export chat as .txt ─────────────────────────────────────── */
function exportChat() {
  const wrappers = document.querySelectorAll('.message-wrapper');
  if (!wrappers.length) { alert('No messages to export.'); return; }

  let txt = `Phi-3 Chat Export — ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;

  wrappers.forEach(w => {
    const role = w.classList.contains('user') ? 'You' : 'Phi-3';
    const bubble = w.querySelector('.message:not(.thinking-bubble)');
    if (bubble) txt += `[${role}]\n${bubble.textContent}\n\n`;
  });

  const blob = new Blob([txt], { type: 'text/plain' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `phi3-chat-${Date.now()}.txt`
  });
  a.click();
  URL.revokeObjectURL(a.href);
}


/* ─── Helpers ─────────────────────────────────────────────────── */
function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function saveChat() {
  const wrappers = document.querySelectorAll('.message-wrapper');
  const messages = [];

  wrappers.forEach(w => {
    const sender = w.classList.contains('user') ? 'user' : 'ai';
    const bubble = w.querySelector('.message');

    if (bubble) {
      messages.push({
        sender: sender,
        text: bubble.textContent
      });
    }
  });

  sessions[activeSession] = messages;

  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    sessions: sessions,
    activeSession: activeSession
  }));
}

function loadChat() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw) {
    const data = JSON.parse(raw);
    sessions = data.sessions || {};
    activeSession = data.activeSession;
  }

  if (!activeSession) {
    createNewChat();
    return;
  }

  renderChatList();
  loadActiveChat();
}

function createNewChat() {
  const id = "chat_" + Date.now();

  sessions[id] = [];
  activeSession = id;

  saveChat();
  renderChatList();
  loadActiveChat();
}

function loadActiveChat() {
  const chatBox = document.getElementById("chat-box");
  chatBox.innerHTML = "";

  const messages = sessions[activeSession] || [];

  messages.forEach(msg => {
    appendMessage(msg.text, msg.sender, false);
  });
}

function renderChatList() {
  const list = document.getElementById("chat-list");

  if (!list) return;

  list.innerHTML = "";

  Object.keys(sessions).reverse().forEach(id => {
    const btn = document.createElement("button");

    btn.textContent = id === activeSession ? "● Current Chat" : "Chat";
    btn.className = "chat-session-btn";

    btn.onclick = () => {
      activeSession = id;
      saveChat();
      renderChatList();
      loadActiveChat();
    };

    list.appendChild(btn);
  });
}

window.addEventListener("load", loadChat);