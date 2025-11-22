
# SearXNG Gemini Overview

## 概要

SearXNGの検索結果ページに、Geminiによる概要を表示するユーザースクリプトです。

検索クエリと検索結果スニペットを収集し、Geminiが生成した情報を、検索結果上部に表示します。

「[SearXNGにGemini AIの回答を表示✨️](https://github.com/koyasi777/searxng-gemini-answer-injector)」に発想を得て作成されました。

## 特徴

- 検索クエリと検索結果を収集し、Geminiが生成した情報を、検索結果上部に表示します。

- 過去に検索されたワードが再検索されたとき、キャッシュを利用して概要の表示を早めます。

- AES-GCMによって、Gemini APIキーを暗号化して保存し、安全性を高めます。

  - 暗号化キーは変更可能です。必要に応じて変更してください。

## インストール方法

- 1.ブラウザに、いずれかのユーザースクリプト拡張機能をインストールします。

  - **[Violentmonkey](https://violentmonkey.github.io/)**

  - **[Tampermonkey](https://www.tampermonkey.net/)**

- 2.下記リンクから、スクリプトをインストールします。

  - **[SearXNG Gemini Overview](https://greasyfork.org/ja/scripts/552122-searxng-gemini-summary)**
 
- 3.スクリプト内の設定を変更します。

  - CONFIGの各項目

  - 暗号化キー

- 4.APIキーを入力します。

  - 初回検索時のみ、Gemini APIキーの入力が必要です。

  - **[Google AI Studio](https://aistudio.google.com/api-keys)** でAPIキーを取得してください。
 
## 暗号化について

- 暗号化キーは、スクリプト内に記された32バイトの文字列です。

- ブラウザ側だけの暗号化であり、完全な機密保持は期待できません。

- 利用時は、32文字のランダム英数字に置き換えることを強く推奨します。


## 対応サイト

- .user.js 内の @match で対応サイトを指定しています。

- 利用するSearXNGインスタンスのURLによっては対応しない場合があります。

- 必要に応じて変更・追加してください。

- @match

  - *://*/searx/search*
 
  - *://*/searxng/search*
 
  - *://searx.*/*
 
  - *://*.searx.*/*
 
  - http://127.0.0.1:8888/search*
 
  - http://localhost:8888/search*

## 動作機構

### 1.ページ判定

- SearXNGの検索ページか確認

### 2.APIをキー取得

- LocalStorageから暗号化キーを取得し、APIキーを復元

- 存在しなければ、ユーザーにAPIキーの入力を求める

### 3.検索クエリを取得

- input[name="q"] で取得

### 4.キャッシュ確認

- キャッシュに同じクエリがあるかチェック

  - あれば、キャッシュを取得しそのまま表示

### 5.UIを構築

- 検索結果上部に「Geminiによる概要」を追加

### 6.スニペットを取得

- 最大(デフォルトは20件)まで取得

- 足りなければ、次のページ分のスニペットを取得

- 各検索結果から必要なテキストのみ取得

### 7.プロンプトを作成

- クエリ + スニペット + 概要の作成指示で構成されたプロンプトを作成

- JSON形式で出力を指定

### 8.Gemini API呼び出し

- プロンプトをGeminiに送信

### 9.JSON解析

- Geminiの応答からJSONを抽出

- JSONからHTMLに変形

### 10.概要表示

- 導入文・セクション・出典を整形して表示

- キャッシュを更新

- 処理終了

## 注意点

- 暗号化の限界

  - ブラウザ側だけの暗号化であり、完全な安全性は保証されません。

  - スクリプト内の暗号化キーは変更することを強く推奨します。

- プロンプトのJSON強制

  - Geminiが期待通りにJSONを返さない場合は、エラーメッセージが表示され、再試行が必要です。

- スニペット依存

  - 要約品質は取得したスニペットの情報量に左右されます。

  - 情報が乏しい場合は「情報が不足しています」と明示されます。

- キャッシュ制限

  - デフォルトは24時間・30個までです。

  - 調整したい場合はスクリプト内のCONFIGを調整してください。

## クレジット

- [Google Gemini API 公式ドキュメント](https://ai.google.dev/)

- [SearXNG](https://github.com/searxng/searxng)

- [Violentmonkey](https://violentmonkey.github.io/)

- [Tampermonkey](https://www.tampermonkey.net/)

- [SearXNGにGemini AIの回答を表示✨️](https://github.com/koyasi777/searxng-gemini-answer-injector)

## ライセンス

- MIT License

  - 自由に改変・再配布可能ですが、使用は自己責任でお願いします。
