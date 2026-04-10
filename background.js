// background.js — service worker
// Fetches arXiv abstract + GitHub implementations via GitHub search API
// No DOMParser — service workers have no DOM. Using regex for XML parsing.

const cache = {};

// ---- XML Helpers ----
function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractAllMatches(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function parseArxivXml(text) {
  const entryMatch = text.match(/<entry>([\s\S]*?)<\/entry>/i);
  if (!entryMatch) throw new Error('No entry in response');
  const entry = entryMatch[1];

  const title     = decodeHtml(extractTag(entry, 'title')   || 'Unknown Title');
  const abstract  = decodeHtml(extractTag(entry, 'summary') || 'No abstract available.');
  const published = extractTag(entry, 'published') || '';

  const authorBlocks = extractAllMatches(entry, 'author');
  const authors = authorBlocks.map(b => {
    const n = extractTag(b, 'name');
    return n ? decodeHtml(n) : null;
  }).filter(Boolean);

  const categories = extractAttr(entry, 'category', 'term');
  return { title, abstract, authors, published, categories };
}

// ---- GitHub search for implementations ----
async function fetchGithubRepos(title) {
  // Use first 6 words of title for best results
  const query = title.split(' ').slice(0, 6).join('+');
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=5`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.items || []).slice(0, 4).map(r => ({
    name: r.full_name,
    url: r.html_url,
    stars: r.stargazers_count,
    description: r.description || '',
    language: r.language || ''
  }));
}

// ---- Message Listener ----
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== 'FETCH_ARXIV') return false;

  const arxivId = request.id;

  if (cache[arxivId]) {
    sendResponse({ ok: true, data: cache[arxivId] });
    return false;
  }

  const cleanId  = arxivId.replace(/v\d+$/, '');
  const arxivUrl = `https://export.arxiv.org/api/query?id_list=${cleanId}&max_results=1`;

  fetch(arxivUrl)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then(async text => {
      const arxivData = parseArxivXml(text);
      // Now fetch GitHub repos using the paper title
      const implementations = await fetchGithubRepos(arxivData.title).catch(() => []);
      const data = { ...arxivData, implementations };
      cache[arxivId] = data;
      sendResponse({ ok: true, data });
    })
    .catch(err => sendResponse({ ok: false, error: err.message }));

  return true;
});
