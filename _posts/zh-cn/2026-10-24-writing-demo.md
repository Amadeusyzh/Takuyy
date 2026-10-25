---
layout: post
published: false # writing-syntax demo (math, code); kept as a template
title: "你好，世界：关于注意力机制的笔记"
date: 2026-10-25 12:00:00+0900
description: "第一篇博客 —— 演示公式、代码的显示效果。"
tags: research notes
categories: notes
related_posts: false
---

这是我博客的第一篇文章。文章放在 `_posts/<语言>/` 目录下，文件名格式为 `YYYY-MM-DD-标题.md`。
可以只用一种语言写；如果想提供翻译，在其它语言目录下放一个**同名**文件即可。

## 公式

缩放点积注意力（Scaled Dot-Product Attention）：

$$
\mathrm{Attention}(Q, K, V) = \mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right) V
$$

行内公式同样支持：$d_k = 64$。

## 代码

```python
import torch
import torch.nn.functional as F

def attention(q, k, v):
    scores = q @ k.transpose(-2, -1) / q.size(-1) ** 0.5
    return F.softmax(scores, dim=-1) @ v
```

## 更多

表格、图片、流程图、Jupyter Notebook、伪代码等写法可参考 [al-folio 示例文章](https://github.com/alshedivat/al-folio/tree/main/_posts)。
