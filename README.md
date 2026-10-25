# 个人学术主页 · Personal Academic Website

基于 [multi-language-al-folio](https://github.com/george-gca/multi-language-al-folio)（[al-folio](https://github.com/alshedivat/al-folio) 的多语言版本），支持 **English / 中文 / 日本語** 三语切换。

| 语言 | 网址 |
| --- | --- |
| English（默认） | `https://amadeusyzh.github.io/Takuyy/` |
| 中文 | `https://amadeusyzh.github.io/Takuyy/zh-cn/` |
| 日本語 | `https://amadeusyzh.github.io/Takuyy/ja-jp/` |

## 需要修改的地方

所有待补充的地方都用 `TODO` 标出（搜索 `TODO` 即可找到），页面上显示为“即将更新 / Coming soon / 準備中”。

| 内容 | 文件 |
| --- | --- |
| 网址、图标 | `_config.yml`（`url`、`icon`；`scholar:` 下的姓名用于在论文列表中高亮自己） |
| 各语言显示的姓名 | `_data/<语言>/strings.yml` 里的 `author.name` / `author.name_sub` |
| 头像 | 替换 `assets/img/prof_pic.jpg`（建议正方形） |
| 首页简介 | `_pages/en-us/about.md`、`_pages/zh-cn/about.md`、`_pages/ja-jp/about.md` |
| 论文列表 | `_bibliography/papers.bib`（三种语言共用；`selected={true}` 的论文会显示在首页，同时把 `about.md` 里的 `selected_papers` 改为 `true`） |
| 论文缩略图 | 放到 `assets/img/publication_preview/`，在 bib 里写 `preview={xxx.png}` |
| 简历（网页版） | `_data/<语言>/cv.yml` |
| 简历（PDF） | `assets/pdf/<语言>/cv.pdf` |
| 社交链接 | `_data/socials.yml`（邮箱、Google Scholar、GitHub、ORCID、OpenReview、X 等） |
| 动态 / News | `_news/<语言>/*.md` |
| 博客 | `_posts/<语言>/YYYY-MM-DD-标题.md` |
| 项目 | `_projects/<语言>/*.md`（目前是隐藏的模板，写好后删掉 `published: false`，并把 `projects.md` 的 `nav` 改为 `true`） |
| 界面文字翻译 | `_data/<语言>/strings.yml` |

### 多语言规则

- 每种语言的内容放在对应的 `en-us/`、`zh-cn/`、`ja-jp/` 子目录里。
- 同一篇文章的不同语言版本使用**相同的文件名**，语言切换按钮会自动对应。
- 某篇文章只写了英文的话，其它语言页面会显示英文版本。
- 不想要某种语言：从 `_config.yml` 的 `languages:` 里删掉即可。

### 博客写作

文章支持 Markdown、LaTeX 公式（`$...$`、`$$...$$`）、代码高亮、目录、图片、Mermaid 图表、Jupyter Notebook、BibTeX 引用等。各种写法的示例见 [al-folio 示例文章](https://github.com/alshedivat/al-folio/tree/main/_posts)。

```markdown
---
layout: post
title: 文章标题
date: 2026-10-25 12:00:00+0900
description: 一句话简介
tags: research notes
categories: notes
toc:
  sidebar: left # 可选：侧边目录
---

正文……
```

## 部署到 GitHub Pages

仓库：[Amadeusyzh/Takuyy](https://github.com/Amadeusyzh/Takuyy)，网址：`https://amadeusyzh.github.io/Takuyy/`

1. 仓库 **Settings → Actions → General → Workflow permissions**，选择 **Read and write permissions**。
2. push 到 `main` 后，GitHub Actions 会自动构建并生成 `gh-pages` 分支（在 **Actions** 页面查看进度）。
3. 仓库 **Settings → Pages → Build and deployment**，Source 选 **Deploy from a branch**，分支选 **`gh-pages`**、目录 `/ (root)`。

之后每次 push 到 `main`，网站都会自动更新。

> 想用更短的网址 `https://amadeusyzh.github.io/`：把仓库改名为 `Amadeusyzh.github.io`，再把 `_config.yml` 里的 `baseurl` 改成空。

## 本地预览

用 Docker（推荐）：

```bash
docker compose pull && docker compose up
# 打开 http://localhost:8080
```

或用 Ruby：

```bash
bundle install
bundle exec jekyll serve
# 打开 http://localhost:4000
```

## 更多文档

- [CUSTOMIZE.md](CUSTOMIZE.md) —— 主题的完整配置说明
- [INSTALL.md](INSTALL.md) —— 安装与部署细节
- [FAQ.md](FAQ.md) —— 常见问题
