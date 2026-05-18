const state = {
  token: localStorage.getItem('bt_token') || null,
  user: JSON.parse(localStorage.getItem('bt_user') || 'null'),
  currentRoute: '',
};

function setAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('bt_token', token);
  localStorage.setItem('bt_user', JSON.stringify(user));
}

function clearAuth() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('bt_token');
  localStorage.removeItem('bt_user');
}

async function api(method, path, body = null) {
  const headers = {'Content-Type': 'application/json'};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function confirm(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-message').textContent = message;
    overlay.classList.remove('hidden');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    const cleanup = (val) => { overlay.classList.add('hidden'); ok.onclick = null; cancel.onclick = null; resolve(val); };
    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function relativeTime(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function todayFormatted() {
  return new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function tagList(tags) {
  if (!tags) return '';
  return tags.split(',').map(t => t.trim()).filter(Boolean)
    .map(t => `<span class="tag">${esc(t)}</span>`).join('');
}

function navigate(path) {
  window.location.hash = '#' + path;
}

function logout() {
  clearAuth();
  updateHeader();
  navigate('/login');
  toast('Signed out', 'info');
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);

function handleRoute() {
  const hash = window.location.hash.replace('#', '') || '/';
  const app = document.getElementById('app');

  const publicPaths = ['/login'];
  if (!state.token && !publicPaths.some(p => hash.startsWith(p))) {
    navigate('/login');
    return;
  }
  if (state.token && hash.startsWith('/login')) {
    navigate('/');
    return;
  }

  updateHeader();
  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  if (hash === '/' || hash === '/feed') renderFeed();
  else if (hash === '/login') renderAuth();
  else if (hash === '/new') renderEditor(null);
  else if (hash.startsWith('/edit/')) renderEditor(hash.replace('/edit/', ''));
  else if (hash.startsWith('/post/')) renderPost(hash.replace('/post/', ''));
  else if (hash === '/profile') renderProfile();
  else {app.innerHTML = '<div class="empty-state"><div class="empty-icon">🗺️</div><div class="empty-title">Page not found</div></div>';}
}

function updateHeader() {
  const header = document.getElementById('site-header');
  if (!state.token) { header.classList.add('hidden'); return; }
  header.classList.remove('hidden');

  const u = state.user;
  document.getElementById('avatar-initials').textContent = initials(u?.display_name || u?.username);
  document.getElementById('dropdown-display-name').textContent = u?.display_name || u?.username || '—';
  document.getElementById('dropdown-username').textContent = '@' + (u?.username || '');

  const avatarBtn = document.getElementById('avatar-btn');
  const menu = avatarBtn.closest('.avatar-menu');
  avatarBtn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('open'); };
  document.addEventListener('click', () => menu.classList.remove('open'), { once: true });
}

function renderAuth(tab = 'login') {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-page page">
      <div class="auth-card">
        <div class="auth-logo">
          <span class="logo-icon">✦</span>
          <span class="logo-text">BlogTell</span>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab ${tab==='login'?'active':''}" id="tab-login" onclick="switchTab('login')">Sign in</button>
          <button class="auth-tab ${tab==='register'?'active':''}" id="tab-register" onclick="switchTab('register')">Create account</button>
        </div>

        <div id="form-login" ${tab!=='login'?'class="hidden"':''}>
          <div class="form-group">
            <label class="form-label">Username or Email</label>
            <input class="form-input" type="text" id="login-login" placeholder="you@example.com" autocomplete="username" />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" />
          </div>
          <div id="login-error" class="form-error hidden"></div>
          <button class="btn-primary form-submit" onclick="doLogin()">Sign in</button>
        </div>

        <div id="form-register" ${tab!=='register'?'class="hidden"':''}>
          <div class="form-group">
            <label class="form-label">Username</label>
            <input class="form-input" type="text" id="reg-username" placeholder="jane_doe" autocomplete="username" />
          </div>
          <div class="form-group">
            <label class="form-label">Display Name</label>
            <input class="form-input" type="text" id="reg-displayname" placeholder="Jane Doe" />
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" type="email" id="reg-email" placeholder="jane@example.com" autocomplete="email" />
          </div>
          <div class="form-group">
            <label class="form-label">Password <span class="muted" style="text-transform:none;letter-spacing:0">(min. 8 chars)</span></label>
            <input class="form-input" type="password" id="reg-password" placeholder="••••••••" autocomplete="new-password" />
          </div>
          <div id="reg-error" class="form-error hidden"></div>
          <button class="btn-primary form-submit" onclick="doRegister()">Create account</button>
        </div>
      </div>
    </div>`;

  document.addEventListener('keydown', function onEnter(e) {
    if (e.key === 'Enter') {
      if (tab === 'login') doLogin();
      else doRegister();
      document.removeEventListener('keydown', onEnter);
    }
  }, { once: true });
}

function switchTab(tab) {
  renderAuth(tab);
}

async function doLogin() {
  const login = document.getElementById('login-login').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const { token, user } = await api('POST', '/auth/login', { login, password });
    setAuth(token, user);
    updateHeader();
    navigate('/');
    toast(`Welcome back, ${user.display_name || user.username}! 👋`, 'success');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const display_name = document.getElementById('reg-displayname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  errEl.classList.add('hidden');
  try {
    const { token, user } = await api('POST', '/auth/register', { username, display_name, email, password });
    setAuth(token, user);
    updateHeader();
    navigate('/');
    toast(`Welcome to BlogTell, ${user.display_name || user.username}! 🎉`, 'success');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

async function renderFeed(category = '', search = '') {
  const app = document.getElementById('app');

  try {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    const { posts } = await api('GET', `/posts?${params}`);

    const cats = {};
    posts.forEach(p => { cats[p.category] = (cats[p.category]||0)+1; });

    app.innerHTML = `
      <div class="feed-page page">
        <div class="feed-main">
          <div class="feed-masthead">
            <div class="feed-date">${todayFormatted()}</div>
            <h1 class="feed-headline">What are people<br><em>talking about?</em></h1>
          </div>
          <div class="feed-divider"><span class="feed-divider-icon">✦</span></div>

          <div class="feed-controls">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input class="search-input" type="search" id="search-input"
                     placeholder="Search posts…" value="${esc(search)}" />
            </div>
            <select class="filter-select" id="cat-select" onchange="renderFeed(this.value, document.getElementById('search-input').value)">
              <option value="">All categories</option>
              ${['General','Opinion','News','Tech','Life','Culture','Science'].map(c =>
                `<option value="${c}" ${category===c?'selected':''}>${c}</option>`
              ).join('')}
            </select>
          </div>

          <div class="posts-list">
            ${posts.length === 0 ? `
              <div class="empty-state">
                <div class="empty-icon">📭</div>
                <div class="empty-title">${search ? 'No posts match your search' : 'Nothing here yet'}</div>
                <div class="empty-text">${search ? 'Try different keywords.' : 'Be the first to share something!'}</div>
              </div>` :
              posts.map(p => postCard(p)).join('')}
          </div>
        </div>

        <aside class="feed-sidebar">
          <div class="sidebar-card">
            <div class="sidebar-title">Categories</div>
            <div class="category-list">
              <div class="category-item ${!category?'active':''}" onclick="renderFeed('', document.getElementById('search-input')?.value||'')">
                All posts <span class="category-count">${posts.length}</span>
              </div>
              ${Object.entries(cats).map(([cat, n]) => `
                <div class="category-item ${category===cat?'active':''}"
                     onclick="renderFeed('${esc(cat)}', document.getElementById('search-input')?.value||'')">
                  ${esc(cat)} <span class="category-count">${n}</span>
                </div>`).join('')}
            </div>
          </div>

          <div class="sidebar-card">
            <div class="sidebar-title">Quick stats</div>
            <div style="font-size:14px;color:var(--text-muted);line-height:2">
              📝 ${posts.length} total posts<br>
              ❤️ ${posts.reduce((a,p)=>a+(p.like_count||0),0)} total likes<br>
              💬 ${posts.reduce((a,p)=>a+(p.comment_count||0),0)} total comments
            </div>
          </div>
        </aside>
      </div>`;

    let searchTimer;
    document.getElementById('search-input').addEventListener('input', function() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        renderFeed(document.getElementById('cat-select').value, this.value.trim());
      }, 350);
    });

  } catch (e) {
    app.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Could not load posts</div><div class="empty-text">${esc(e.message)}</div></div>`;
  }
}

function postCard(p) {
  const isOwn = state.user?.id === p.author_id || state.user?.username === p.username;
  return `
    <div class="post-card" onclick="navigate('/post/${p.id}')">
      <div class="post-card-header">
        <div class="post-meta">
          <span class="tag category">${esc(p.category||'General')}</span>
          <span class="meta-dot">•</span>
          <span class="post-author-link" onclick="event.stopPropagation()">${esc(p.display_name||p.username)}</span>
          <span class="meta-dot">•</span>
          <span class="post-date">${relativeTime(p.created_at)}</span>
        </div>
        ${isOwn ? `
        <div onclick="event.stopPropagation()" style="display:flex;gap:6px">
          <button class="btn-ghost" style="font-size:12px;padding:4px 10px" onclick="navigate('/edit/${p.id}')">Edit</button>
          <button class="btn-ghost" style="font-size:12px;padding:4px 10px;color:var(--danger)" onclick="deletePost(${p.id})">Delete</button>
        </div>` : ''}
      </div>
      <div class="post-card-title">${esc(p.title)}</div>
      <div class="post-card-excerpt">${esc(p.excerpt || p.content_preview || '')}</div>
      <div class="post-card-footer">
        <div class="post-tags">${tagList(p.tags)}</div>
        <div class="post-stats">
          <span class="stat"><span class="stat-icon">${p.liked?'❤️':'🤍'}</span>${p.like_count||0}</span>
          <span class="stat"><span class="stat-icon">💬</span>${p.comment_count||0}</span>
        </div>
      </div>
    </div>`;
}

async function deletePost(id) {
  const ok = await confirm('Delete this post? This action cannot be undone.');
  if (!ok) return;
  try {
    await api('DELETE', `/posts/${id}`);
    toast('Post deleted', 'success');
    renderFeed();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function renderPost(id) {
  const app = document.getElementById('app');
  try {
    const [post, comments] = await Promise.all([
      api('GET', `/posts/${id}`),
      api('GET', `/posts/${id}/comments`),
    ]);
    const isOwn = state.user?.id === post.author_id;

    app.innerHTML = `
      <div class="post-page page">
        <a class="post-back" onclick="navigate('/')">
          <span class="post-back-arrow">←</span> Back to feed
        </a>

        <article class="post-header">
          <div class="post-category-row">
            <span class="tag category">${esc(post.category||'General')}</span>
            ${tagList(post.tags)}
          </div>
          <h1 class="post-title">${esc(post.title)}</h1>
          <div class="post-byline">
            <div class="byline-avatar">${initials(post.display_name||post.username)}</div>
            <div class="byline-info">
              <span class="byline-name">${esc(post.display_name||post.username)}</span>
              <span class="byline-date">${relativeTime(post.created_at)}${post.updated_at!==post.created_at?' · edited':''}</span>
            </div>
            ${isOwn ? `
            <div class="byline-actions">
              <button class="btn-secondary" onclick="navigate('/edit/${post.id}')">Edit</button>
              <button class="btn-danger" onclick="deletePostAndBack(${post.id})">Delete</button>
            </div>` : ''}
          </div>
        </article>

        <div class="post-body">${esc(post.content)}</div>

        <div class="post-footer-bar">
          <button class="like-btn ${post.liked?'liked':''}" id="like-btn" onclick="toggleLike(${post.id})">
            <span class="like-icon">${post.liked?'❤️':'🤍'}</span>
            <span id="like-count">${post.like_count||0}</span>
            ${post.liked?'Liked':'Like'}
          </button>
          <div class="post-footer-stats">
            <span class="stat"><span class="stat-icon">💬</span> ${comments.length} comment${comments.length!==1?'s':''}</span>
          </div>
        </div>

        <section class="comments-section">
          <h2 class="comments-title">Discussion</h2>

          <div class="comment-form">
            <textarea class="comment-textarea" id="comment-input" placeholder="Share your thoughts…" rows="3"></textarea>
            <div class="comment-form-footer">
              <button class="btn-primary" onclick="submitComment(${post.id})">Post comment</button>
            </div>
          </div>

          <div class="comments-list" id="comments-list">
            ${comments.length === 0
              ? '<div class="empty-state" style="padding:32px"><div class="empty-icon" style="font-size:32px">💬</div><div class="empty-text">No comments yet. Start the discussion!</div></div>'
              : comments.map(c => commentItem(c, post.id)).join('')}
          </div>
        </section>
      </div>`;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Post not found</div><div class="empty-text">${esc(e.message)}</div></div>`;
  }
}

function commentItem(c, postId) {
  const isOwn = state.user?.id === c.author_id || state.user?.username === c.username;
  return `
    <div class="comment-item" id="comment-${c.id}">
      <div class="comment-avatar">${initials(c.display_name||c.username)}</div>
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${esc(c.display_name||c.username)}</span>
          <span class="comment-date">${relativeTime(c.created_at)}</span>
          ${isOwn ? `<button class="comment-delete" onclick="deleteComment(${postId}, ${c.id})">✕</button>` : ''}
        </div>
        <div class="comment-text">${esc(c.content)}</div>
      </div>
    </div>`;
}

async function toggleLike(postId) {
  try {
    const { liked, like_count } = await api('POST', `/posts/${postId}/like`);
    const btn = document.getElementById('like-btn');
    const cnt = document.getElementById('like-count');
    btn.className = `like-btn ${liked?'liked':''}`;
    btn.querySelector('.like-icon').textContent = liked ? '❤️' : '🤍';
    btn.lastChild.textContent = liked ? 'Liked' : 'Like';
    cnt.textContent = like_count;
  } catch (e) {toast(e.message, 'error');}
}

async function submitComment(postId) {
  const input = document.getElementById('comment-input');
  const content = input.value.trim();
  if (!content) { 
    toast('Write something first!', 'info'); 
    return; }
  try {
    const c = await api('POST', `/posts/${postId}/comments`, { content });
    c.display_name = state.user.display_name;
    const list = document.getElementById('comments-list');
    if (list.querySelector('.empty-state')) list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', commentItem(c, postId));
    input.value = '';
    list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteComment(postId, commentId) {
  const ok = await confirm('Delete this comment?');
  if (!ok) return;
  try {
    await api('DELETE', `/posts/${postId}/comments/${commentId}`);
    document.getElementById(`comment-${commentId}`)?.remove();
    toast('Comment deleted', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function deletePostAndBack(id) {
  const ok = await confirm('Delete this post? This cannot be undone.');
  if (!ok) return;
  try {
    await api('DELETE', `/posts/${id}`);
    toast('Post deleted', 'success');
    navigate('/');
  } catch (e) { toast(e.message, 'error'); }
}

async function renderEditor(editId) {
  const app = document.getElementById('app');
  let post = null;

  if (editId) {
    try {
      post = await api('GET', `/posts/${editId}`);
      if (post.author_id !== state.user?.id) {
        toast("You can't edit someone else's post", 'error');
        navigate('/');
        return;
      }
    } catch (e) {
      toast(e.message, 'error');
      navigate('/');
      return;
    }
  }

  const CATS = ['General','Opinion','News','Tech','Life','Culture','Science'];

  app.innerHTML = `
    <div class="editor-page page">
      <div class="editor-header">
        <div class="editor-title-label">${editId ? 'Edit post' : 'New post'}</div>
        <div class="editor-actions">
          <button class="btn-secondary" onclick="navigate(${editId ? `'/post/${editId}'` : "'/'"})" >Cancel</button>
          <button class="btn-primary" onclick="savePost(${editId||'null'})">
            ${editId ? 'Save changes' : 'Publish'}
          </button>
        </div>
      </div>

      <input class="editor-title-input" id="post-title"
             placeholder="Your headline here…"
             value="${esc(post?.title||'')}" />

      <div class="editor-meta-row">
        <div class="form-group" style="margin:0">
          <label class="form-label">Category</label>
          <select class="form-select" id="post-category">
            ${CATS.map(c => `<option value="${c}" ${post?.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Tags <span class="muted" style="text-transform:none;letter-spacing:0">(comma-separated)</span></label>
          <input class="form-input" id="post-tags" placeholder="e.g. ai, productivity, fun"
                 value="${esc(post?.tags||'')}" />
        </div>
      </div>

      <textarea class="editor-body" id="post-content"
                placeholder="Write your thoughts here…">${esc(post?.content||'')}</textarea>
      <div class="char-count"><span id="char-count">0</span> characters</div>
    </div>`;

  const content = document.getElementById('post-content');
  const charCount = document.getElementById('char-count');
  charCount.textContent = content.value.length;
  content.addEventListener('input', () => { charCount.textContent = content.value.length; });
}

async function savePost(editId) {
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const category = document.getElementById('post-category').value;
  const tags = document.getElementById('post-tags').value.trim();

  if (!title) { 
    toast('Title is required', 'error'); 
    return; }
  if (!content) { 
    toast('Content is required', 'error'); 
    return; }

  try {
    if (editId) {
      await api('PUT', `/posts/${editId}`, {title, content, category, tags});
      toast('Post updated!', 'success');
      navigate(`/post/${editId}`);
    } else {
      const post = await api('POST', '/posts', {title, content, category, tags});
      toast('Post published! ✨', 'success');
      navigate(`/post/${post.id}`);
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function renderProfile() {
  const app = document.getElementById('app');
  try {
    const [me, { posts }] = await Promise.all([
      api('GET', '/auth/me'),
      api('GET', `/posts?author=${state.user.username}`),
    ]);

    localStorage.setItem('bt_user', JSON.stringify({ ...state.user, ...me }));
    state.user = { ...state.user, ...me };

    app.innerHTML = `
      <div class="profile-page page">
        <div class="profile-card">
          <div class="profile-avatar">${initials(me.display_name||me.username)}</div>
          <div class="profile-info">
            <div class="profile-display">${esc(me.display_name||me.username)}</div>
            <div class="profile-username">@${esc(me.username)} · Member since ${new Date(me.created_at).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div>
            <div class="profile-bio" id="bio-text">${esc(me.bio||'No bio yet.')}</div>
            <div class="bio-edit-area" id="bio-edit">
              <textarea class="form-textarea" id="bio-input" rows="3" style="margin-top:10px">${esc(me.bio||'')}</textarea>
              <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn-primary" style="font-size:13px;padding:7px 14px" onclick="saveBio()">Save</button>
                <button class="btn-secondary" style="font-size:13px;padding:7px 14px" onclick="cancelBio()">Cancel</button>
              </div>
            </div>
            <div class="profile-actions">
              <button class="btn-secondary" onclick="toggleBioEdit()">Edit profile</button>
              <button class="btn-primary" onclick="navigate('/new')">+ New post</button>
            </div>
          </div>
        </div>

        <div class="profile-stats">
          <div class="profile-stat">
            <div class="profile-stat-num">${posts.length}</div>
            <div class="profile-stat-label">Posts</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-num">${posts.reduce((a,p)=>a+(p.like_count||0),0)}</div>
            <div class="profile-stat-label">Likes received</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-num">${posts.reduce((a,p)=>a+(p.comment_count||0),0)}</div>
            <div class="profile-stat-label">Comments received</div>
          </div>
        </div>

        <div class="profile-section-title">My posts</div>
        <div class="posts-list">
          ${posts.length === 0
            ? '<div class="empty-state"><div class="empty-icon">✍️</div><div class="empty-title">Nothing published yet</div></div>'
            : posts.map(p => postCard(p)).join('')}
        </div>
      </div>`;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Could not load profile</div></div>`;
  }
}

function toggleBioEdit() {
  const edit = document.getElementById('bio-edit');
  const text = document.getElementById('bio-text');
  edit.classList.toggle('active');
  text.style.display = edit.classList.contains('active') ? 'none' : '';
}

function cancelBio() {
  document.getElementById('bio-edit').classList.remove('active');
  document.getElementById('bio-text').style.display = '';
}

async function saveBio() {
  const bio = document.getElementById('bio-input').value.trim();
  try {
    const me = await api('PUT', '/auth/me', { bio });
    state.user = { ...state.user, bio: me.bio };
    localStorage.setItem('bt_user', JSON.stringify(state.user));
    document.getElementById('bio-text').textContent = me.bio || 'No bio yet.';
    cancelBio();
    toast('Profile updated!', 'success');
  } catch (e) {toast(e.message, 'error');}
}

window.navigate = navigate;
window.logout = logout;
window.switchTab = switchTab;
window.doLogin = doLogin;
window.doRegister = doRegister;
window.renderFeed = renderFeed;
window.deletePost = deletePost;
window.toggleLike = toggleLike;
window.submitComment = submitComment;
window.deleteComment = deleteComment;
window.deletePostAndBack = deletePostAndBack;
window.savePost = savePost;
window.toggleBioEdit = toggleBioEdit;
window.cancelBio = cancelBio;
window.saveBio = saveBio;