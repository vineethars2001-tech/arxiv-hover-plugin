// arXiv Abstract Hover + GitHub Implementations — content.js

const ARXIV_REGEX = /arxiv\.org\/(?:abs|pdf|html)\/[\d]/i;

let tooltip = null;
let currentLink = null;
let hoverTimer = null;
let hideTimer = null;
let cache = {};

// ---- Create Tooltip DOM ----
function createTooltip() {
  const el = document.createElement('div');
  el.id = 'arxiv-hover-tooltip';
  el.innerHTML = `
    <div class="arxiv-tooltip-inner">
      <div class="arxiv-header">
        <span class="arxiv-logo">arXiv</span>
        <span class="arxiv-id-label"></span>
        <a class="arxiv-open-link" target="_blank" rel="noopener">↗ Open</a>
      </div>
      <div class="arxiv-title"></div>
      <div class="arxiv-meta">
        <span class="arxiv-authors"></span>
        <span class="arxiv-date"></span>
      </div>
      <div class="arxiv-abstract"></div>
      <div class="arxiv-categories"></div>
      <div class="arxiv-implementations" style="display:none">
        <div class="arxiv-impl-title">
          <span class="arxiv-impl-icon">⟨/⟩</span> Implementations on GitHub
        </div>
        <div class="arxiv-impl-list"></div>
      </div>
      <div class="arxiv-loading">
        <div class="arxiv-spinner"></div>
        <span>Fetching paper data…</span>
      </div>
      <div class="arxiv-error" style="display:none">Could not load paper data.</div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

// ---- Extract arXiv ID from URL ----
function extractArxivId(href) {
  const match = href.match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (match) return match[1];
  const oldMatch = href.match(/arxiv\.org\/(?:abs|pdf)\/([a-z\-]+\/\d{7})/i);
  if (oldMatch) return oldMatch[1];
  return null;
}

// ---- Show loading state ----
function showLoading() {
  tooltip.querySelector('.arxiv-loading').style.display = 'flex';
  tooltip.querySelector('.arxiv-error').style.display = 'none';
  tooltip.querySelector('.arxiv-implementations').style.display = 'none';
  tooltip.querySelector('.arxiv-title').textContent = '';
  tooltip.querySelector('.arxiv-abstract').textContent = '';
  tooltip.querySelector('.arxiv-authors').textContent = '';
  tooltip.querySelector('.arxiv-date').textContent = '';
  tooltip.querySelector('.arxiv-categories').innerHTML = '';
  tooltip.querySelector('.arxiv-impl-list').innerHTML = '';
  tooltip.querySelector('.arxiv-id-label').textContent = '';
  tooltip.querySelector('.arxiv-open-link').href = '#';
}

// ---- Populate tooltip ----
function populateTooltip(data, arxivId) {
  tooltip.querySelector('.arxiv-loading').style.display = 'none';
  tooltip.querySelector('.arxiv-title').textContent = data.title;
  tooltip.querySelector('.arxiv-abstract').textContent = data.abstract;
  tooltip.querySelector('.arxiv-id-label').textContent = arxivId;
  tooltip.querySelector('.arxiv-open-link').href = `https://arxiv.org/abs/${arxivId}`;

  // Authors
  const authStr = data.authors.slice(0, 3).join(', ') +
    (data.authors.length > 3 ? ` +${data.authors.length - 3} more` : '');
  tooltip.querySelector('.arxiv-authors').textContent = authStr;

  // Date
  if (data.published) {
    const d = new Date(data.published);
    tooltip.querySelector('.arxiv-date').textContent =
      d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Categories
  if (data.categories && data.categories.length) {
    const cats = data.categories.slice(0, 4)
      .map(c => `<span class="arxiv-cat-tag">${c}</span>`).join('');
    tooltip.querySelector('.arxiv-categories').innerHTML = cats;
  }

  // GitHub Implementations
  const impls = data.implementations || [];
  const implSection = tooltip.querySelector('.arxiv-implementations');
  const implList = tooltip.querySelector('.arxiv-impl-list');

  if (impls.length > 0) {
    implList.innerHTML = impls.map(r => `
      <a class="arxiv-impl-item" href="${r.url}" target="_blank" rel="noopener">
        <div class="arxiv-impl-left">
          <span class="arxiv-impl-name">${r.name}</span>
          ${r.description ? `<span class="arxiv-impl-desc">${r.description.slice(0, 60)}${r.description.length > 60 ? '…' : ''}</span>` : ''}
        </div>
        <div class="arxiv-impl-right">
          ${r.language ? `<span class="arxiv-framework">${r.language}</span>` : ''}
          <span class="arxiv-stars">★ ${r.stars.toLocaleString()}</span>
        </div>
      </a>
    `).join('');
    implSection.style.display = 'block';
  } else {
    implList.innerHTML = `
      <a class="arxiv-impl-item arxiv-impl-fallback" href="https://paperswithcode.com/paper/${arxivId.replace(/v\d+$/, '')}" target="_blank" rel="noopener">
        <span class="arxiv-impl-name">Search implementations on PapersWithCode ↗</span>
      </a>
    `;
    implSection.style.display = 'block';
  }
}

// ---- Fetch via background worker ----
async function fetchArxivData(arxivId) {
  if (cache[arxivId]) return cache[arxivId];
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_ARXIV', id: arxivId }, (response) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (!response || !response.ok) { reject(new Error(response?.error || 'Unknown error')); return; }
      cache[arxivId] = response.data;
      resolve(response.data);
    });
  });
}

// ---- Position tooltip ----
function positionTooltip(x, y) {
  if (!tooltip) return;
  const margin = 16;
  const tw = 480;
  const th = tooltip.offsetHeight || 400;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = x + margin;
  let top  = y + margin;

  if (left + tw > vw - margin) left = x - tw - margin;
  if (top + th > vh - margin)  top  = y - th - margin;
  if (top < margin)  top  = margin;
  if (left < margin) left = margin;

  tooltip.style.left = `${left + window.scrollX}px`;
  tooltip.style.top  = `${top  + window.scrollY}px`;
}

// ---- Show tooltip ----
function showTooltip(link, arxivId, x, y) {
  if (!tooltip) tooltip = createTooltip();
  showLoading();
  positionTooltip(x, y);
  tooltip.classList.add('visible');

  fetchArxivData(arxivId)
    .then(data => {
      if (currentLink === link) populateTooltip(data, arxivId);
    })
    .catch(() => {
      if (currentLink === link) {
        tooltip.querySelector('.arxiv-loading').style.display = 'none';
        tooltip.querySelector('.arxiv-error').style.display = 'block';
      }
    });
}

// ---- Hide tooltip ----
function hideTooltip() {
  if (tooltip) tooltip.classList.remove('visible');
  currentLink = null;
}

// ---- Event Listeners ----
document.addEventListener('mouseover', (e) => {
  if (tooltip && tooltip.contains(e.target)) {
    clearTimeout(hideTimer);
    return;
  }

  const link = e.target.closest('a[href]');
  if (!link) return;
  const href = link.href || '';
  if (!ARXIV_REGEX.test(href)) return;
  const arxivId = extractArxivId(href);
  if (!arxivId) return;

  clearTimeout(hoverTimer);
  clearTimeout(hideTimer);
  currentLink = link;

  hoverTimer = setTimeout(() => {
    if (currentLink === link) showTooltip(link, arxivId, e.clientX, e.clientY);
  }, 300);
});

document.addEventListener('mouseout', (e) => {
  const fromTooltip = tooltip && tooltip.contains(e.target);
  const fromLink = e.target.closest('a[href]') === currentLink;

  if (!fromTooltip && !fromLink) return;
  if (tooltip && tooltip.contains(e.relatedTarget)) return;
  if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('a[href]') === currentLink) return;

  clearTimeout(hoverTimer);
  hideTimer = setTimeout(() => hideTooltip(), 250);
});
