# SearXNG Gemini Overview

> **本READMEは v1.5.0 時点の挙動に基づいています。**

## 概要

SearXNGの検索結果ページのサイドバー上部に、Geminiによる概要を表示するユーザースクリプトです。

SearXNGにおける「AIによる概要(Google AI Overview)」の代替としての役割を担うことを目指します。

検索クエリと検索結果を収集し、Geminiが生成した情報を、サイドバー(`#sidebar`)先頭の「Gemini Overview」ボックスに表示します。

「[SearXNGにGemini AIの回答を表示✨️](https://github.com/koyasi777/searxng-gemini-answer-injector)」に発想を得て作成されました。

## 特徴

- 検索クエリと検索結果を収集し、独自のプロンプトをGeminiに送信します。

- Geminiが生成した情報を、サイドバー上部の「Gemini Overview」ボックスに表示します。

- 本文・セクション形式の概要に加え、出典番号 `[n]` のリンクと「主な出典」(引用頻度上位3サイト)を表示します。

- 過去に検索されたワードが再検索されたとき、キャッシュを利用して概要の表示を早めます。

  - 有効期限は7日間です。期限切れのキャッシュは自動的に削除されます。

  - 同じクエリで、かつ検索結果URLの一致率が25%以上のとき、キャッシュを再利用します。

- JSONモード(responseSchema)により、Geminiの出力を構造化して受け取ります。

- OS・ブラウザのダークモード設定に追従したUIを表示します。

- Gemini APIキーは、ユーザースクリプトのストレージ(GM_setValue/GM_getValue)に保存します。

## インストール方法

- 1.ブラウザに、いずれかのユーザースクリプト拡張機能をインストールします。

  - **[Violentmonkey](https://violentmonkey.github.io/)**

  - **[Tampermonkey](https://www.tampermonkey.net/)**

- 2.GitHub Releasesより、任意のバージョンの「searxng-gemini-overview_vx.y.z-Release.user.js」を開きます。

  - ユーザースクリプト管理アドオンによってインストール待機画面に飛ばされます。

- 3.「+編集」を選択し、スクリプト内の `CONFIG` 設定を変更します。

  - 設定の各項目(括弧内はデフォルト値)

    - MODEL_NAME (`gemini-2.5-flash-lite`) : Gemini APIのモデル名

    - MAX_RESULTS (`20`) : 参照する検索結果のサイト数

    - SNIPPET_CHAR_LIMIT (`5000`) : 送信テキストの文字数制限(※v1.5.0時点では未使用)

    - MAX_RETRY (`3`) : 何らかのエラーにより中断された場合のリトライ回数

    - RETRY_DELAY (`1500`) : リトライ時の基本遅延(ms)。リトライごとに指数バックオフ(1500ms → 3000ms → ...)で増加します。

    - CACHE_TTL_MS (`604800000` = 7日間) : キャッシュの有効期限(ms)

    - CACHE_MATCH_THRESHOLD (`0.25`) : キャッシュ再利用に必要な検索結果URLの一致率

- 4.「保存して閉じる」を選択します。

- 5.初回検索時、Gemini APIキーの入力します。

  - **[Google AI Studio](https://aistudio.google.com/api-keys)** でAPIキーを取得してください。

## APIキーの保存について

- 入力されたAPIキーは、ユーザースクリプトのストレージ(GM_setValue/GM_getValue)にそのまま保存されます。

- 保存はブラウザ内で完結し、外部へ送信されません。

- 暗号化されていないため、完全な機密保持は期待できません。共有PCなどでの利用は避けてください。

## 対応サイト

- スクリプト内の @match で対応サイトを指定しています。

- [SearXNG Instances](https://searx.space/)を参照して作成しました。

- 利用するSearXNGインスタンスのURLによっては対応しない場合があります。

- 必要に応じて変更・追加してください。

## 動作機構

### 1.ページ判定

- SearXNGの検索ページか確認(`#search_form` / `#main_results` / `#sidebar` の存在チェック)

### 2.キャッシュのクリーンアップ

- 有効期限(CACHE_TTL_MS)を過ぎたキャッシュを削除

### 3.APIキーを取得

- ユーザースクリプトのストレージからAPIキーを取得

- 存在しなければ、入力モーダルを表示してユーザーに入力を求め、保存

### 4.UIを構築

- サイドバー(`#sidebar`)先頭に「Gemini Overview」ボックスを追加

- ダークモード設定の変更にも追従

### 5.検索クエリを取得

- input[name="q"] で取得

### 6.スニペットを取得

- 最大(MAX_RESULTS、デフォルトは20件)まで取得

- 足りなければ、次のページ分の検索結果をPOSTリクエストで追加取得

### 7.スニペットを整形

- 各検索結果からタイトル・URL・スニペットを抽出

- スニペット末尾の検索エンジン名などのノイズを除去

### 8.キャッシュ確認

- 同じクエリのキャッシュがあり、有効期限内かつ検索結果URLの一致率がCACHE_MATCH_THRESHOLD以上なら、キャッシュを即時表示して終了

### 9.プロンプトを作成

- クエリ + 出典番号付き検索データ + 概要の作成指示で構成されたプロンプトを作成

- 出力言語はブラウザの言語設定(navigator.language)に追従

### 10.Gemini API呼び出し

- JSONモード(responseMimeType + responseSchema)でGeminiに送信

  - レスポンススキーマ: 本文(body) + セクション配列(sections[].title / content[])

### 11.リトライ処理

- 失敗時は指数バックオフで最大MAX_RETRY回まで再試行

- 全失敗時はエラーメッセージを表示

### 12.概要表示

- 導入文(body)・セクション(sections)を出典リンク・強調表示つきで整形して表示

- 引用頻度の高い出典を「主な出典」として上位3件表示

- 生成時刻を表示

- キャッシュを保存し、処理終了

## 注意点

- APIキーの取り扱い

  - APIキーは平文でユーザースクリプトのストレージに保存されます。完全な安全性は保証されません。

- スニペット依存

  - 要約品質は取得したスニペットの情報量に左右されます。

- DOM構造への依存

  - SearXNGのHTML構造(`#main_results`、`#sidebar` など)に依存するため、インスタンスのバージョンやテーマによっては動作しない場合があります。

## クレジット

- [Google Gemini API 公式ドキュメント](https://ai.google.dev/)

- [SearXNG](https://github.com/searxng/searxng)

- [Violentmonkey](https://violentmonkey.github.io/)

- [Tampermonkey](https://www.tampermonkey.net/)

- [SearXNGにGemini AIの回答を表示✨️](https://github.com/koyasi777/searxng-gemini-answer-injector)

## ライセンス

- MIT License

  - 自由に改変・再配布可能ですが、使用は自己責任でお願いします。
