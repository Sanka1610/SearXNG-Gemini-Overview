// ==UserScript==
// @name         SearXNG Gemini Overview
// @namespace    https://github.com/Sanka1610/SearXNG-Gemini-Overview
// @version      1.4.0
// @description  SearXNGの検索結果にGeminiによる概要を表示します
// @author       Sanka1610
// @match        *://searx.*/*
// @match        *://searxng.*/*
// @match        *://search.*/*
// @match        *://priv.au/*
// @match        *://im-in.space/*
// @match        *://ooglester.com/*
// @match        *://fairsuch.net/*
// @match        *://copp.gg/*
// @match        *://darmarit.org/searx/*
// @match        *://etsi.me/*
// @match        *://gruble.de/*
// @match        *://seek.fyi/*
// @match        *://baresearch.org/*
// @match        *://search.zina.dev/*
// @match        *://opnxng.com/*
// @match        *://search.bladerunn.in/*
// @match        *://127.0.0.1:8888/search*
// @match        *://localhost:8888/search*
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/Sanka1610/SearXNG-Gemini-Overview
// @supportURL   https://github.com/Sanka1610/SearXNG-Gemini-Overview/issues
// @icon         https://docs.searxng.org/_static/searxng-wordmark.svg
// ==/UserScript==

(async () => {
    'use strict';


// 基本設定
    const CONFIG = {
        MODEL_NAME: 'gemini-2.5-flash-lite',   // GeminiのAPIモデル名
        MAX_RESULTS: 20,                       // 検索結果数
        SNIPPET_CHAR_LIMIT: 5000,              // 文字数上限
        MAX_RETRY: 3,                          // リトライ回数
        RETRY_DELAY: 1500,                     // リトライ間隔
        CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // キャッシュ有効期限
        CACHE_MATCH_THRESHOLD: 0.25            // 一致率
    };


// APIの暗号化キー
    const FIXED_KEY = '1234567890abcdef1234567890abcdef';

// ダークモード判定
    const isDark = window.matchMedia('(prefers-color-scheme:dark)').matches;


// ユーティリティ関数

  // ログ出力
    const log = {
        info: (...args) => console.info('[GeminiOverview]', ...args),
        error: (...args) => console.error('[GeminiOverview]', ...args)
    };

  // 検索結果の取得
    async function fetchSearchResults(form, mainResults, maxResults) {
        let results = Array.from(mainResults.querySelectorAll('.result'));
        let currentCount = results.length;
        let pageNo = parseInt(new FormData(form).get('pageno') || 1);
        async function fetchNext() {
            if (currentCount >= maxResults) return [];
            pageNo++;
            const fd = new FormData(form);
            fd.set('pageno', pageNo);
            try {
                const resp = await fetch(form.action, { method: 'POST', body: fd });
                const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
                const newItems = Array.from(doc.querySelectorAll('#main_results .result'))
                                      .slice(0, maxResults - currentCount);
                currentCount += newItems.length;
                if (currentCount < maxResults && newItems.length > 0) {
                    return newItems.concat(await fetchNext());
                }
                return newItems;
            } catch (e) {
                log.error('Fetch error:', e);
                return [];
            }
        }
        const additional = await fetchNext();
        results.push(...additional);
        return results.slice(0, maxResults);
    }

  // URL整形
    const urlUtils = {
        normalize: (url) => {
            if (!url) return '';
            try {
                let u = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
                return u.endsWith('/') ? u.slice(0, -1) : u;
            } catch (e) { return url; }
        },

  // サイト名抽出
        getSiteName: (url) => {
            if (!url) return '';
            try {
                let domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
                let siteName = domain.split('.')[0];
                return siteName.charAt(0).toUpperCase() + siteName.slice(1);
            } catch (e) { return url; }
        }
    };

  // JSONをhtml化
    const formatResponse = (text, urlList, isBody = false) => {
        if (!text) return '';
        let baseHtml = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const tokens = baseHtml.match(/\[\d+\]|[。.]|\n+|[^\[\]。.\n]+/g) || [];
        const sentences = [];
        let current = { text: "", cites: new Set(), punct: "", tail: "" };
        const commit = () => {
            if (current.text || current.punct || current.cites.size > 0 || current.tail) {
                sentences.push({ ...current, cites: new Set(current.cites) });
                current = { text: "", cites: new Set(), punct: "", tail: "" };
            }
        };
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (/^\[\d+\]$/.test(t)) {
                const num = parseInt(t.match(/\d+/)[0]);
                if (!current.text && !current.punct && sentences.length > 0) {
                    sentences[sentences.length - 1].cites.add(num);
                } else {
                    current.cites.add(num);
                }
            } else if (/^[。.]$/.test(t)) {
                current.punct = t;
            } else if (/^\n+$/.test(t)) {
                current.tail = t;
                commit();
            } else {
                if (current.text && (current.punct || current.cites.size > 0)) {
                    commit();
                }
                current.text += t;
            }
        }
        commit();

        // HTML再構築
        return sentences.map((s, idx) => {
            const citeHtml = Array.from(s.cites).sort((a, b) => a - b).map(num => {
                const url = urlList[num - 1];
                return url 
                    ? `<sup style="white-space:nowrap;"><a href="${url}" target="_blank" style="text-decoration:none; color:#3399FF; font-weight:bold;">[${num}]</a></sup>`
                    : `<sup style="white-space:nowrap;">[${num}]</sup>`;
            }).join('');
            let html = s.text + s.punct + citeHtml;

      // 改行処理
            let tail = s.tail;
            if (isBody) {
                if (tail) {
                    tail = tail.replace(/\n/g, '<br>');
                    if (tail === '<br>') tail = '<br><br>';
                } else if (s.punct && idx < sentences.length - 1) {
                    tail = '<br><br>';
                }
            }

            return html + tail;
        }).join('');
    };

// APIキー管理

  // APIキー暗号化
    async function encrypt(text) {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(FIXED_KEY), 'AES-GCM', false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
        return btoa(String.fromCharCode(...iv)) + ':' + btoa(String.fromCharCode(...new Uint8Array(ct)));
    }

  // APIキー復化
    async function decrypt(cipher) {
        const [ivB64, ctB64] = cipher.split(':');
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(FIXED_KEY), 'AES-GCM', false, ['decrypt']);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        return new TextDecoder().decode(decrypted);
    }

  // APIキー取得UI
    async function getApiKey(force = false) {
        if (force) localStorage.removeItem('GEMINI_API_KEY');
        let encrypted = localStorage.getItem('GEMINI_API_KEY');
        if (encrypted) {
            try { return await decrypt(encrypted); } catch (e) { log.error(e); }
        }
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: '9999', backdropFilter: 'blur(4px)'
        });
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: isDark ? '#252525' : '#fff', color: isDark ? '#eee' : '#333',
            padding: '2em', borderRadius: '16px', textAlign: 'center', maxWidth: '400px', width: '90%'
        });
        modal.innerHTML = `
            <h2 style="margin-top:0;">Gemini API設定</h2>
            <p>概要の生成にはAPIキーが必要です。</p>
            <input id="gemini-input" type="password" placeholder="APIキーを入力してください" style="width:100%; padding:10px; margin:20px 0; border-radius:8px; border:1px solid #555;">
            <button id="gemini-save" style="background:#3399FF; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold;">保存</button>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        return new Promise(resolve => {
            overlay.querySelector('#gemini-save').onclick = async () => {
                const val = overlay.querySelector('#gemini-input').value.trim();
                if (!val) return;
                localStorage.setItem('GEMINI_API_KEY', await encrypt(val));
                overlay.remove();
                resolve(val);
                location.reload();
            };
        });
    }

// ユーティリティ関数-2

  // 描画処理
    function renderOverview(data, contentEl, timeEl, urlList) {
        if (!data) return;

    // 引用リンクの集計
        const counts = {};
        const fullText = (data.body || '') + (data.sections || []).map(s => (s.content || []).join(' ')).join(' ');
        const matches = fullText.match(/\[(\d+)\]/g) || [];
        matches.forEach(m => { const n = parseInt(m.replace(/\D/g, '')); counts[n] = (counts[n] || 0) + 1; });

    // bodyのhtml化
        let html = '';
        if (data.body) {
            const bodyHtml = formatResponse(data.body, urlList, true);
            html += `<section style="margin-bottom:1.5em;"><div style="line-height:1.8;">${bodyHtml}</div></section>`;
        }

    // sectionのhtml化
        if (data.sections) {
            data.sections.forEach(sec => {
                html += `<section style="margin-bottom:1.2em;"><strong>${sec.title}</strong><ul style="margin-top:0.5em;">`;
                sec.content.forEach(item => html += `<li style="margin-bottom:0.6em; line-height:1.6;">${formatResponse(item, urlList, false)}</li>`);
                html += '</ul></section>';
            });
        }

    // 主な出典のhtml化
        const top3 = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>parseInt(e[0]));
        if (top3.length > 0) {
            html += '<div style="border-top:1px solid rgba(128,128,128,0.3); padding-top:0.8em; font-size:0.95em;"><strong>主な出典:</strong><ul style="list-style:none; padding:0; margin-top:5px;">';
            top3.sort((a,b)=>a-b).forEach(idx => {
                const url = urlList[idx-1];
                if (url) html += `<li style="margin-bottom:3px;">[${idx}] <a href="${url}" target="_blank" style="color:#3399FF; text-decoration:none;">${urlUtils.getSiteName(url)}</a></li>`;
            });
            html += '</ul></div>';
        }

    // 最終描画
        contentEl.innerHTML = html;
        timeEl.textContent = new Date().toLocaleTimeString('ja-JP');
    }


// メインロジック

  // 動作検証
    const form = document.querySelector('#search_form, form[action="/search"]');
    const mainResults = document.getElementById('main_results');
    const sidebar = document.querySelector('#sidebar');
    if (!form || !mainResults || !sidebar) return;

  // APIキー確認
    const API_KEY = await getApiKey();
    if (!API_KEY) return;

  // UI構築
    const aiBox = document.createElement('div');
    aiBox.style = `margin: 1em 0; padding: 1.2em; border-radius: 12px; border: 1px solid rgba(128,128,128,0.2); background: ${isDark ? "rgba(255,255,255,0.05)" : "#f9f9f9"}`;
    aiBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1em;">
            <div>
                <span style="font-weight:bold;">Gemini Overview</span>
                <span id="gemini-cache-status" style="font-size:0.8em; color:gray; margin-left:8px;"></span>
            </div>
            <span id="gemini-time" style="font-size:0.8em; opacity:0.6;"></span>
        </div>
        <div id="gemini-content" style="font-size:0.95em;">情報を収集中...</div>`;
    sidebar.insertBefore(aiBox, sidebar.firstChild);

  // 要素取得
    const contentEl = aiBox.querySelector('#gemini-content');
    const timeEl = aiBox.querySelector('#gemini-time');
    const cacheStatusEl = aiBox.querySelector('#gemini-cache-status');

  // 検索クエリ取得
    const query = document.querySelector('input[name="q"]').value;

  // 検索結果取得
    const results = await fetchSearchResults(form, mainResults, CONFIG.MAX_RESULTS);

  // 検索エンジン名とキャッシュの装飾を削除
    const ENGINE_NAMES = 'duckduckgo|bing|brave|google|qwant|wikipedia|yahoo';
    const excludePatterns = [
        new RegExp(`\\s*[\\|\\-\\·•]\\s*(?:${ENGINE_NAMES})(?:\\s+(?:${ENGINE_NAMES}|キャッシュ|cache))*$`, 'i'),
        new RegExp(`\\s*(?:${ENGINE_NAMES})(?:\\s+(?:${ENGINE_NAMES}|キャッシュ|cache))+$`, 'i'),
        new RegExp(`(?:キャッシュ|cache)$`, 'i')
    ];

  // 検索結果格納
    const resultBlocks = [];
    const urlList = [];
    const normalizedList = [];

  // 検索結果を処理
    results.forEach((r, i) => {

      // タイトル
        const titleEl = r.querySelector('h3, .result__title, .title, article h2');

      // リンク
        const anchor = r.querySelector('h3 a, article a, .result__title a') || r.querySelector('a');
        if (!anchor) return;

      // タイトル整形
        const title = (titleEl ? titleEl.innerText : anchor.innerText).replace(/\s+/g, ' ').trim();

  // スニペット取得
        let snippetEl = r.querySelector('.result__snippet, .content, .description');
        let snippet = (snippetEl ? snippetEl.innerText : r.innerText).trim();

  // 不要なものを除去
        let cleanedSnippet = snippet.replace(title, '').replace(/^https?:\/\/\S+/i, '').replace(/\s+/g, ' ');
        excludePatterns.forEach(p => cleanedSnippet = cleanedSnippet.replace(p, ''));
        cleanedSnippet = cleanedSnippet.trim();
        if (cleanedSnippet && title) {

  // 出典を整理
            const idx = urlList.length + 1;

  // URL保存
            urlList.push(anchor.href);
            normalizedList.push(urlUtils.normalize(anchor.href));

  // Geminiの送信用データ作成
            resultBlocks.push(`{[${idx}] Title: ${title}, Content: ${cleanedSnippet}}`);
        }
    });

// キャッシュ

  // キャッシュキー作成
    const CACHE_KEY = `GEMINI_CACHE_${encodeURIComponent(query)}`;
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);

  // キャッシュ判定
        const matchRate = normalizedList.filter(u => cached.urls.includes(u)).length / CONFIG.MAX_RESULTS;

  // 描画処理
        if (matchRate >= CONFIG.CACHE_MATCH_THRESHOLD) {
            cacheStatusEl.textContent = 'キャッシュを再利用';
            renderOverview(cached.overview, contentEl, timeEl, urlList);
            return;
        }
    }

// プロンプト作成
    const userLang = navigator.language || 'ja';
    const promptText = `

# クエリ:${query}
# ユーザー言語:${userLang}
# データ:${resultBlocks.join('\n')}

# 指示
1. 提供データのみを根拠に、クエリへの簡潔かつ具体的な概要を作成しなさい。
2. 情報源が多数あるため、複数のソースで共通する重要な情報を優先し、網羅的にまとめなさい。
3. 情報が不足する場合は、過度な推測を避けつつ自然な補完に留めなさい。
4. 内容が複数の観点に分かれる場合、複数のsectionsを使用しなさい。
5. 出力はユーザー言語（${userLang}）で記述しなさい。
6. 各文末または箇条書き末に、必ず参照番号を[n]形式で付けなさい（例: ~。[1][2]~）。
7. 全体はおおよそ300字以内に収めなさい。
8. コードブロックや説明文は不要。
9. 必ず以下のJSON形式のみで出力しなさい。

#形式:

{
  "body": "全体の概要",
  "sections": [
    { "title": "見出し", "content": ["ポイント1", "ポイント2"] }
  ]
}`;

// その他

  // 再試行
    let finalData = null;
    let lastError = null;
    for (let attempt = 0; attempt < CONFIG.MAX_RETRY; attempt++) {
        try {
            if (attempt > 0) {
                contentEl.textContent = `再試行中... (${attempt + 1}/${CONFIG.MAX_RETRY})`;
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1)));
            } else {
                contentEl.textContent = 'Geminiの返答を待機中...';
            }
            const response = await

  // APIリクエスト送信
            fetch(`https://generativelanguage.googleapis.com/v1/models/${CONFIG.MODEL_NAME}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
            });

  // HTTPエラー
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            const resData = await response.json();
            const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // JSON抽出
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Invalid JSON format');

  // JSONパース
            finalData = JSON.parse(jsonMatch[0]);
            break;

  // エラー処理
        } catch (err) {
            lastError = err;
            log.error(`Attempt ${attempt + 1} failed:`, err);
        }
    }

// 最終結果

  // 成功
    if (finalData) {

    // キャッシュに保存
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), urls: normalizedList, overview: finalData }));

    // 概要表示
        renderOverview(finalData, contentEl, timeEl, urlList);

  // 失敗
    } else {
        contentEl.textContent = `エラー: ${lastError?.message || 'JSONの解析に失敗しました'}`;
    }

})();
