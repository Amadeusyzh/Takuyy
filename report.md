# Final report: ja-review (branch `api/ja-review`)

The Japanese versions of all 11 posts were already in good shape. I made about 70 targeted fixes in total, and only one change touched en-us and zh-cn. `site-build` passes, and `site-check` on all 11 posts passes in all three languages at both widths.

## How I reviewed

- **Script checks (all 11 posts, ja against en):** heading counts, figures, widgets, code blocks, `<details>` blocks, table rows, list items, links and numbers all match. The only number differences are unit conversions, such as 26 万 = 260 thousand and 5000 万 = 50 million. No untranslated paragraphs, leftover Chinese, or である/だ endings in prose were found.
- **Terminology:** I checked usage across all ja-jp posts. Each post already spells シェーダ/シェーダー and レンダラ/レンダラー one way throughout, but the two series differ, so I left those as they are.
- **Two full reading passes per post:** subagents did both passes. The first was a full read for Japanese quality, missing English terms and captions. The second compared ja with en paragraph by paragraph, including captions, tables, hints and exercises. I read every diff before committing and corrected two awkward edits myself.
- **Zh-review changes:** the earlier Chinese review's commits had already changed all three languages, so nothing needed mirroring.

## Changes per post

| Post | Changes |
|---|---|
| graphics-08 | **Meaning fix:** after min/max/smooth-min the result was called 距離の上界 (upper bound); it is now 距離の下界（真の距離以下の値）, the bound that keeps sphere tracing safe. Reworded the centroid-orientation sentence. Added English terms: barycentric area, mixed Voronoi area, maximum principle, intrinsic Delaunay triangulation. |
| graphics-09 | Replaced エンボディード AI with 身体性 AI everywhere (link texts and prose). Spline control points now explicitly belong to the first and second segment, not the first and second control point. Added English terms: skinning, IK, rotation vector, domain randomization. |
| graphics-10 | 3D Gaussian Splatting → ガウシアンスプラッティング. Exercise 4's comparison sentence now matches en (lookup counts at equal variance). Reworded one stiff phrase in the learning resources. Added English terms: importance sampling, next event estimation, Russian roulette. |
| graphics-11 | Fixed the garbled cascade-blending sentence. The SH widget lead-in now says radiance rings long before irradiance does. The tone-mapping "Try it" step now compares clamp against PBR Neutral instead of reading as two steps in sequence. オペレーター → 演算子. Added 8 English terms (penumbra, overdraw, exposure, tone mapping, hysteresis, roofline, occupancy, blending). |
| graphics-12 | Fixed the garbled boundary-term sentence. Made the definitions of f⁻ and f⁺ unambiguous. Reworded the 決着のつかなさ phrase (en "ties"). 層別 → 層化 to match the rest of the post. Added English terms: Jacobian, Laplacian, popping, unscented transform. |
| graphics-engine-01 | Added English terms: cache, symplectic, broad phase. The second pass found nothing to change. |
| graphics-engine-02 | Deferred shading now also gives 遅延シェーディング, the term graphics-11 uses. The task-shader sentence now clearly does two things: it culls meshlets and it decides how many groups to launch. Added English terms: validation layer, mip chain, transient resource. |
| graphics-engine-03 | クラスタ → クラスター (3) and レイヤ → レイヤー (8). **Meaning fix:** the glTF accessor is now itself a typed view into a bufferView, as in en. 147 が対応 → 147 から対応. Two small wording fixes. Added English terms: outgoing radiance, aliasing. |
| graphics-engine-04 | クラスタ → クラスター (50, to match engine-02 and graphics-11). Fixed the garbled grazing-ray sentence in the sphere-tracing section. Added English terms: importance sampling, clustered forward rendering. Version numbers and dates checked against en; all match. |
| graphics-engine-05 | Fixed an ungrammatical phrase in the throughput item (何千個もの世界のコピーを). The domain-randomization caption now includes センサノイズ, as en says "Gaussian sensor noise". Fixed a noun-ending sentence in a caption. Added English terms: inertia tensor, heightfield, Jacobian, ragdoll. **All languages:** split the inline triple-product formula at "=", because it overflowed by 1 px at 390 px in en, zh and ja. |
| graphics-engine-06 | Made the reference to the previous post explicit (前回の記事で扱ったエンジン). Added English terms: optical flow, hybrid rendering, autoregressive video diffusion, spatial memory. The second pass found nothing to change. |

**Commits:** 534078b (graphics 08-12), 5b4033d (engine 01-06), ead1707 (second pass), 937d9e1 (engine-05 overflow fix in all three languages).

## Build and site-check

- **Build:** `site-build` exits 0. The one Lexer warning comes from the bibliography, not from these posts.
- **site-check:** I ran it on all 11 posts × 3 languages × 2 widths. The only finding was the engine-05 overflow; after the fix I rebuilt and re-checked that post, and it is clean in all three languages. No broken images, unrendered math or console errors.
- **Screenshots:** I looked at several ja screenshots, including a page top, a widget and a figure. The text and widget labels are localized and legible on a phone.

## Open issues and suggested shared changes

- **"Bound" in graphics-08 en/zh:** these still say only "a bound on the distance" after CSG. Saying "lower bound" in all languages would be clearer; I made it explicit only in ja.
- **Spelling across series:** graphics 04-06 and 10-12 use シェーダー/レンダラー, while graphics-08/09 and the engine series use シェーダ/レンダラ. Each post is consistent internally. Settling on one spelling site-wide would be a separate, mechanical change.
- **Figure text:** the SVG figures carry English labels in every language. That is the existing design and outside this brief.

Nothing in the assignment is left undone.
