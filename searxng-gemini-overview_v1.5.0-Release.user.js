// ==UserScript==
// @name         SearXNG Gemini Overview
// @namespace    https://github.com/Sanka1610/SearXNG-Gemini-Overview
// @version      1.5.0
// @description  SearXNGの検索結果にGeminiによる概要を表示します
// @author       Sanka1610
// @match        *://127.0.0.1:8888/search*
// @match        *://localhost:8888/search*
// @match        *://searx.*/*
// @match        *://searxng.*/*
// @match        *://search.2b9t.xyz/*
// @match        *://search.abohiccups.com/*
// @match        *://search.anoni.net/*
// @match        *://search.bladerunn.in/*
// @match        *://search.catboy.house/*
// @match        *://search.charliewhiskey.net/*
// @match        *://search.darkness.services/*
// @match        *://search.einfachzocken.eu/*
// @match        *://search.ethibox.fr/*
// @match        *://search.femboy.ad/*
// @match        *://search.freestater.org/*
// @match        *://search.hbubli.cc/*
// @match        *://search.im-in.space/*
// @match        *://search.indst.eu/*
// @match        *://search.inetol.net/*
// @match        *://search.internetsucks.net/*
// @match        *://search.ipsys.bf/*
// @match        *://search.ipv6s.net/*
// @match        *://search.mdosch.de/*
// @match        *://search.minus27315.dev/*
// @match        *://search.oh64.moe/*
// @match        *://search.ononoki.org/*
// @match        *://search.pereira.is/*
// @match        *://search.pi.vps.pw/*
// @match        *://search.privacyredirect.com/*
// @match        *://search.rhscz.eu/*
// @match        *://search.rowie.at/*
// @match        *://search.sapti.me/*
// @match        *://search.seddens.net/*
// @match        *://search.serpensin.com/*
// @match        *://search.undertale.uk/*
// @match        *://search.unredacted.org/*
// @match        *://search.url4irl.com/*
// @match        *://search.wdpserver.com/*
// @match        *://search.zina.dev/*
// @match        *://baresearch.org/*
// @match        *://copp.gg/*
// @match        *://etsi.me/*
// @match        *://find.xenorio.xyz/*
// @match        *://grep.vim.wtf/*
// @match        *://im-in.space/*
// @match        *://kantan.cat/*
// @match        *://o5.gg/*
// @match        *://ooglester.com/*
// @match        *://opnxng.com/*
// @match        *://paulgo.io/*
// @match        *://priv.au/*
// @match        *://s.mble.dk/*
// @match        *://seek.fyi/*
// @match        *://sx.catgirl.cloud/*
// @match        *://www.gruble.de/*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// @homepageURL  https://github.com/Sanka1610/SearXNG-Gemini-Overview
// @supportURL   https://github.com/Sanka1610/SearXNG-Gemini-Overview/issues
// @icon         https://docs.searxng.org/_static/searxng-wordmark.svg
// ==/UserScript==

(async () => {
    'use strict';

// 設定定数
    const CONFIG = {
        MODEL_NAME: 'gemini-2.5-flash-lite',   // GeminiAPIモデル
        MAX_RESULTS: 20,                       // 解析対象の検索結果の上限
        SNIPPET_CHAR_LIMIT: 5000,              // 送信テキストの制限
        MAX_RETRY: 3,                          // 失敗時の再試行回数
        RETRY_DELAY: 1500,                     // 再試行の間隔(ms)
        CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // キャッシュ有効期限 (7日間)
        CACHE_MATCH_THRESHOLD: 0.25            // 一致率によるキャッシュ判定
    };

// ユーティリティ関数

  // ログ出力
    const log = {
        info: (...args) => console.info('[GeminiOverview]', ...args),
        error: (...args) => console.error('[GeminiOverview]', ...args)
    };

  // URL整形
    const urlUtils = {

    // 正規化
        normalize: (url) => {
            if (!url) return '';
            try {
                let u = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
                return u.endsWith('/') ? u.slice(0, -1) : u;
            } catch (e) { return url; }
        },

    // サイト名の抽出
        getSiteName: (url) => {
            if (!url) return '';
            try {
                let domain = new URL(url).hostname.replace(/^www\./, '');
                let siteName = domain.split('.')[0];
                return siteName.charAt(0).toUpperCase() + siteName.slice(1);
            } catch (e) { return url; }
        },

    // 安全なプロトコルかチェック
        isValid: (url) => {
            try {
                const u = new URL(url);
                return u.protocol === 'http:' || u.protocol === 'https:';
            } catch (e) { return false; }
        }
    };

  // スニペットのノイズ除去
    const snippetUtils = {
        clean: (text) => {
            const ENGINE_NAMES = 'duckduckgo|bing|brave|google|qwant|wikipedia|yahoo';
            const excludePatterns = [
                new RegExp(`\\s*[\\|\\-\\·•]\\s*(?:${ENGINE_NAMES})(?:\\s+(?:${ENGINE_NAMES}|キャッシュ|cache))*$`, 'i'),
                new RegExp(`\\s*(?:${ENGINE_NAMES})(?:\\s+(?:${ENGINE_NAMES}|キャッシュ|cache))+$`, 'i'),
                new RegExp(`(?:キャッシュ|cache)$`, 'i')
            ];
            let result = text;
            excludePatterns.forEach(p => result = result.replace(p, ''));
            return result.trim();
        }
    };


  // キャッシュ管理

    // キャッシュのクリーンアップ
    function cleanupOldCaches() {
        const now = Date.now();
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('GEMINI_CACHE_')) {
                try {
                    const item = JSON.parse(localStorage.getItem(key));
                    if (now - item.timestamp > CONFIG.CACHE_TTL_MS) {
                        localStorage.removeItem(key);
                    }
                } catch (e) {
                    localStorage.removeItem(key);
                }
            }
        }
    }

  // APIキー管理
    async function getApiKey(force = false) {
        let key = force ? null : GM_getValue('GEMINI_API_KEY');
        if (key) return key;

    // ダークモード判定
        return new Promise((resolve) => {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            
    // 取得UI

      // 背景
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
                alignItems: 'center', zIndex: '9999', backdropFilter: 'blur(4px)'
            });

      // 本体
            const modal = document.createElement('div');
            Object.assign(modal.style, {
                background: isDark ? '#252525' : '#fff', color: isDark ? '#eee' : '#333',
                padding: '2em', borderRadius: '16px', textAlign: 'center', maxWidth: '400px', width: '90%'
            });

            modal.innerHTML = `
                <h2 style="margin-top:0;">Gemini API設定</h2>
                <p>概要の生成にはAPIキーが必要です。</p>
                <input id="gemini-input" type="password" placeholder="APIキーを入力" 
                    style="width:100%; padding:10px; margin:20px 0; border-radius:8px; border:1px solid #555; box-sizing:border-box;">
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button id="gemini-save" style="background:#3399FF; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold;">保存</button>
                    <button id="gemini-cancel" style="background:#666; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold;">キャンセル</button>
                </div>
            `;

      // 表示
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

      // 保存処理
            overlay.querySelector('#gemini-save').onclick = () => {
                const val = overlay.querySelector('#gemini-input').value.trim();
                if (val) {
                    GM_setValue('GEMINI_API_KEY', val);
                    document.body.removeChild(overlay);
                    resolve(val);
                    location.reload();
                }
            };

      // キャンセル処理
            overlay.querySelector('#gemini-cancel').onclick = () => {
                document.body.removeChild(overlay);
                resolve(null);
            };
        });
    }

    // テキスト整形
    function formatTextNodes(text, urlList, isListItem = false) {
        const fragment = document.createDocumentFragment();
        
      // 改行ロジック
        let formatted = text;

        // 出典記号[n]と[br]の並び順の補正
        formatted = formatted.replace(/\[br\]\s*(\[\d+\])/g, '$1[br]');

        // [br]を改行コードに変更
        if (formatted.includes('[br]')) {
            formatted = formatted.replace(/\[br\]/g, '\n\n');
        } else if (!isListItem) {

        // [br]がない場合、従来の改行ロジック
            formatted = formatted.replace(/。/g, '。\n\n');
            formatted = formatted.replace(/\.(?=[A-Z])/g, '.\n\n');
        }

        formatted = formatted.replace(/\n{3,}/g, '\n\n').trim();
        const parts = formatted.split(/(\*\*.*?\*\*|\[\d+\]|\n)/g);
        
        parts.forEach(part => {
            if (!part) return;
            if (part === '\n') {
                fragment.appendChild(document.createElement('br'));
            } else if (part.startsWith('**') && part.endsWith('**')) {

      // 強調表示
                const strong = document.createElement('strong');
                strong.textContent = part.slice(2, -2);
                fragment.appendChild(strong);
            } else if (/^\[\d+\]$/.test(part)) {

      // 出典リンク
                const num = parseInt(part.match(/\d+/)[0]);
                const url = urlList[num - 1];
                const sup = document.createElement('sup');
                sup.style.whiteSpace = 'nowrap';

                if (url && urlUtils.isValid(url)) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = '_blank';
                    a.textContent = `[${num}]`;
                    Object.assign(a.style, { textDecoration: 'none', color: '#3399FF', fontWeight: 'bold' });
                    sup.appendChild(a);
                } else {
                    sup.textContent = `[${num}]`;
                }
                fragment.appendChild(sup);
            } else {

        // 通常のテキスト
                fragment.appendChild(document.createTextNode(part));
            }
        });
        return fragment;
    }


  // UI描画処理
    function renderOverview(data, contentEl, timeEl, urlList) {
        if (!data) return;
        contentEl.textContent = '';
        
    // 出典統計
        const counts = {};
        const fullText = (data.body || '') + (data.sections || []).map(s => (s.content || []).join(' ')).join(' ');
        (fullText.match(/\[(\d+)\]/g) || []).forEach(m => {
            const n = parseInt(m.replace(/\D/g, ''));
            counts[n] = (counts[n] || 0) + 1;
        });

    // Bodyの描画
        if (data.body) {
            const section = document.createElement('section');
            section.style.marginBottom = '1.5em';
            const bodyDiv = document.createElement('div');
            Object.assign(bodyDiv.style, { lineHeight: '1.8', whiteSpace: 'pre-wrap' });
            bodyDiv.appendChild(formatTextNodes(data.body, urlList));
            section.appendChild(bodyDiv);
            contentEl.appendChild(section);
        }

    // 各sectionの描画
        if (data.sections) {
            data.sections.forEach(sec => {
                const section = document.createElement('section');
                section.style.marginBottom = '1.2em';
                
                const title = document.createElement('strong');
                title.textContent = sec.title;
                
                const ul = document.createElement('ul');
                ul.style.marginTop = '0.5em';
                
                sec.content.forEach(item => {
                    const li = document.createElement('li');
                    Object.assign(li.style, { marginBottom: '0.6em', lineHeight: '1.6', whiteSpace: 'pre-wrap' });
                    li.appendChild(formatTextNodes(item, urlList, true));
                    ul.appendChild(li);
                });

                section.append(title, ul);
                contentEl.appendChild(section);
            });
        }

    // 上位3つを主な出典
        const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => parseInt(e[0]));
        if (top3.length > 0) {
            const footer = document.createElement('div');
            Object.assign(footer.style, { borderTop: '1px solid rgba(128,128,128,0.3)', paddingTop: '0.8em', fontSize: '0.95em' });
            
            const label = document.createElement('strong');
            label.textContent = '主な出典:';
            
            const ul = document.createElement('ul');
            Object.assign(ul.style, { listStyle: 'none', padding: '0', marginTop: '5px' });
            
            top3.sort((a, b) => a - b).forEach(idx => {
                const url = urlList[idx - 1];
                if (url && urlUtils.isValid(url)) {
                    const li = document.createElement('li');
                    li.style.marginBottom = '3px';
                    li.textContent = `[${idx}] `;
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = '_blank';
                    a.textContent = urlUtils.getSiteName(url);
                    Object.assign(a.style, { color: '#3399FF', textDecoration: 'none' });
                    li.appendChild(a);
                    ul.appendChild(li);
                }
            });
            footer.append(label, ul);
            contentEl.appendChild(footer);
        }

    // 時間表示
        timeEl.textContent = new Date().toLocaleTimeString('ja-JP');
    }

  // 検索結果取得 簡易クローラー
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
                    return newItems.concat(await fetchNext()); // 再帰呼び出し
                }
                return newItems;
            } catch (e) { return []; }
        }
        results.push(...(await fetchNext()));
        return results.slice(0, maxResults);
    }

// メイン処理
    const form = document.querySelector('#search_form, form[action="/search"]');
    const mainResults = document.getElementById('main_results');
    const sidebar = document.querySelector('#sidebar');
    if (!form || !mainResults || !sidebar) return;

  // 初期化
    cleanupOldCaches();
    const API_KEY = await getApiKey();
    if (!API_KEY) return;

  // UIコンテナ構築
    const aiBox = document.createElement('div');
    aiBox.style.cssText = `margin: 1em 0; padding: 1.2em; border-radius: 12px; border: 1px solid rgba(128,128,128,0.2);`;
    
    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1em' });
    
    const titleGroup = document.createElement('div');
    const boxTitle = document.createElement('span');
    boxTitle.style.fontWeight = 'bold';
    boxTitle.textContent = 'Gemini Overview';
    const cacheStatusEl = document.createElement('span');
    Object.assign(cacheStatusEl.style, { fontSize: '0.8em', color: 'gray', marginLeft: '8px' });
    titleGroup.append(boxTitle, cacheStatusEl);

    const timeEl = document.createElement('span');
    Object.assign(timeEl.style, { fontSize: '0.8em', opacity: '0.6' });
    header.append(titleGroup, timeEl);

    const contentEl = document.createElement('div');
    contentEl.style.fontSize = '0.95em';
    contentEl.textContent = '情報を収集中...';

    aiBox.append(header, contentEl);
    sidebar.insertBefore(aiBox, sidebar.firstChild);

    // ダークモードに追従
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    function updateTheme(e) {
        const isDark = e.matches;
        aiBox.style.background = isDark ? "rgba(255,255,255,0.05)" : "#f9f9f9";
        aiBox.style.color = isDark ? "#eee" : "#333";
    }
    mediaQuery.addEventListener('change', updateTheme);
    updateTheme(mediaQuery);

  // 検索クエリと結果の収集
    const query = document.querySelector('input[name="q"]').value;
    const results = await fetchSearchResults(form, mainResults, CONFIG.MAX_RESULTS);

  // リスト化
    const resultBlocks = [];
    const urlList = [];
    const normalizedList = [];

  // 抽出・整形
    results.forEach((r) => {
        const titleEl = r.querySelector('h3, .result__title, .title, article h2');
        const anchor = r.querySelector('h3 a, article a, .result__title a') || r.querySelector('a');
        if (!anchor) return;

        const title = (titleEl ? titleEl.innerText : anchor.innerText).replace(/\s+/g, ' ').trim();
        const snippetEl = r.querySelector('.result__snippet, .content, .description');
        const snippet = (snippetEl ? snippetEl.innerText : r.innerText).trim();

        const cleaned = snippetUtils.clean(snippet.replace(title, '').replace(/\s+/g, ' ').trim());
        if (cleaned && title) {

    // URL保存
            urlList.push(anchor.href);
            normalizedList.push(urlUtils.normalize(anchor.href));

    // リンク付与
            resultBlocks.push(`{[${urlList.length}] Title: ${title}, Content: ${cleaned}}`);
        }
    });

// キャッシュ

  // キャッシュキー作成
    const CACHE_KEY = `GEMINI_CACHE_${encodeURIComponent(query)}`;
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
        try {
            const cached = JSON.parse(cachedRaw);
            if (Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS) {

  // キャッシュ判定
                const matchRate = normalizedList.filter(u => cached.urls.includes(u)).length / CONFIG.MAX_RESULTS;

  // キャッシュ描画
                if (matchRate >= CONFIG.CACHE_MATCH_THRESHOLD) {
                    cacheStatusEl.textContent = 'キャッシュを再利用';
                    renderOverview(cached.overview, contentEl, timeEl, urlList);
                    return;
                }
            }
        } catch (e) {}
    }

  // プロンプト作成
    const userLang = navigator.language || 'ja';
    const promptText = `
        Data:${resultBlocks.join('\n')} 

        # 指示
1. 提供データのみを根拠に、クエリ(${query})への簡潔かつ具体的な概要を作成しなさい。
2. 情報源が多数あるため、複数のソースで共通する重要な情報を優先し、網羅的にまとめなさい。
3. 情報が不足する場合は、過度な推測を避けつつ自然な補完に留めなさい。
4. 内容が複数の観点に分かれる場合、複数のsectionsを使用しなさい。
5. 出力はユーザー言語（${userLang}）で記述しなさい。
6. 各文末または箇条書き末に、必ず参照番号を[n]形式で付けなさい。（例: です~。[1][2][br]なので、~）
7. 文の区切りや段落を変えたい箇所には、必ず記号[br]を挿入しなさい。参照番号がある場合は、その直後に[br]を置くこと。
    `;

  // APIリクエスト
    let finalData = null;
    let lastError = null;

    // 再試行
    for (let attempt = 0; attempt < CONFIG.MAX_RETRY; attempt++) {
        try {
            if (attempt > 0) {
                contentEl.textContent = `再試行中... (${attempt + 1}/${CONFIG.MAX_RETRY})`;
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1)));
            }

    // JSONモード : v1beta
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL_NAME}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                body: { 
                                    type: "STRING",
                                    description: "概要の本文。改行が必要な箇所には必ず[br]を挿入し、出典[n]の直後に配置すること。"
                                },
                                sections: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            title: { type: "STRING" },
                                            content: { 
                                                type: "ARRAY", 
                                                items: { 
                                                    type: "STRING",
                                                    description: "箇条書きの項目。この中では原則[br]は使用中しない。出典[n]は使用する。"
                                                } 
                                            }
                                        },
                                        required: ["title", "content"]
                                    }
                                }
                            },
                            required: ["body", "sections"]
                        }
                    }
                })
            });

    // エラーハンドリング
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `HTTP Error ${response.status}`;
                throw new Error(errorMessage);
            }
            
            const resData = await response.json();
            
    // 出力の抽出
            finalData = JSON.parse(resData.candidates[0].content.parts[0].text);
            break;

    // エラー処理
        } catch (err) {
            lastError = err;
            log.error(`Attempt ${attempt + 1} failed:`, err);
        }
    }

  // 最終描画

    // 成功
    if (finalData) {

      // キャッシュ
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), urls: normalizedList, overview: finalData }));

      // 描画処理
        renderOverview(finalData, contentEl, timeEl, urlList);

    // 失敗→エラー処理
    } else {
        contentEl.textContent = `エラー: ${lastError?.message || '取得失敗'}`;
    }

})();
