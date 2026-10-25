---
layout: post
published: false # writing-syntax demo (math, code); kept as a template
title: "Hello World: notes on attention"
date: 2026-10-25 12:00:00+0900
description: "My first post — how this blog renders math, code and citations."
tags: research notes
categories: notes
related_posts: false
---

This is the first post on my blog. Posts live in `_posts/<lang>/` as Markdown files named `YYYY-MM-DD-title.md`.
Write a post in one language only, or add a file with the **same name** in other language folders to translate it.

## Math

Scaled dot-product attention, written in LaTeX:

$$
\mathrm{Attention}(Q, K, V) = \mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right) V
$$

Inline math also works: $d_k = 64$.

## Code

```python
import torch
import torch.nn.functional as F

def attention(q, k, v):
    scores = q @ k.transpose(-2, -1) / q.size(-1) ** 0.5
    return F.softmax(scores, dim=-1) @ v
```

## More

See the [al-folio demo posts](https://github.com/alshedivat/al-folio/tree/main/_posts) for tables, figures, diagrams, Jupyter notebooks, pseudocode and more.
