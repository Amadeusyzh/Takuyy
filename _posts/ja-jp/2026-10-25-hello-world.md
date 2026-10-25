---
layout: post
title: "Hello World：Attention についてのメモ"
date: 2026-10-25 12:00:00+0900
description: "最初の記事 —— 数式とコードの表示例。"
tags: research notes
categories: notes
related_posts: false
---

ブログ最初の記事です。記事は `_posts/<言語>/` に `YYYY-MM-DD-タイトル.md` という名前で置きます。
1 つの言語だけで書いても構いません。翻訳する場合は、他の言語フォルダに**同じファイル名**で追加してください。

## 数式

Scaled Dot-Product Attention：

$$
\mathrm{Attention}(Q, K, V) = \mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right) V
$$

インライン数式も使えます：$d_k = 64$。

## コード

```python
import torch
import torch.nn.functional as F

def attention(q, k, v):
    scores = q @ k.transpose(-2, -1) / q.size(-1) ** 0.5
    return F.softmax(scores, dim=-1) @ v
```

## その他

表・画像・図・Jupyter Notebook・疑似コードなどの書き方は [al-folio のサンプル記事](https://github.com/alshedivat/al-folio/tree/main/_posts) を参照してください。
