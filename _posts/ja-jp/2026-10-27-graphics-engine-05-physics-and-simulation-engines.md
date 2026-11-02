---
layout: post
title: "物理・シミュレーションエンジン：ゲーム物理からロボットシミュレータへ"
date: 2026-10-27 13:05:00+0900
description: "物理エンジンの 1 ステップの中身（ブロードフェーズ、GJK と EPA、接触マニフォールド、PGS/TGS/soft step/XPBD ソルバ、多関節体）を見たうえで、Isaac・MuJoCo・Newton・Genesis がエンジンをロボットシミュレータに変える方法、OpenUSD、ドメインランダム化を解説します。"
categories: graphics-engine
tags: [physics-engine, gjk, epa, collision-detection, constraint-solver, articulations, isaac-sim, mujoco, newton, openusd, domain-randomization]
series: graphics-engine
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[エンジンの解剖]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})の回では、物理はエンジンのフレームの中の 1 つの箱として描かれ、固定タイムステップで駆動されていました。本記事ではその箱を開けます。中にはパイプラインがあり、どの物体が接触しうるかを見つけ、どこで接触しているかを正確に計算し、接触力と関節力を数百マイクロ秒で解きます。同じパイプラインをより正確に、微分可能に、大規模並列にしたものが、いまロボットや身体性エージェントが学習するシミュレータの中核です。グラフィックスエンジンのシリーズがロボットシミュレータで締めくくられ、次の記事が世界モデルへとつながるのはこのためです。

積分法、PBD/XPBD、布の数学は[グラフィックス第 07 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})に、ロボティクスの視点から見たシミュレータとベンチマークは[身体性 AI 第 03 回]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})にあります。ここではエンジン内部の視点、つまりデータ構造、アルゴリズム、設計上のトレードオフを扱います。

## 前提知識

- ベクトル、内積と外積。凸集合（任意の 2 点を結ぶ線分を含む集合）。
- ニュートンの法則と力積（力積 $\mathbf{J}$ によって $\Delta \mathbf{v} = \mathbf{J}/m$）。
- [グラフィックス第 07 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})のシンプレクティック・オイラー法と XPBD、[エンジン第 01 回]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})の固定タイムステップループ。
- Python と NumPy。

## 1. 物理の 1 ステップ

剛体（rigid body）は質量 $m$、慣性テンソル $\mathbf{I}$、位置 $\mathbf{x}$、姿勢 $\mathbf{q}$、並進速度 $\mathbf{v}$、角速度 $\boldsymbol{\omega}$ を持ち、さらに 1 つ以上の衝突**形状**（shape）を持ちます。球、箱、カプセル、凸包、三角形メッシュ、ハイトフィールドなどです。`step(dt)` を呼ぶたびに、図に示した同じ段階が実行されます。

1. **外力の積分**：$\mathbf{v} \mathrel{+}= h\,\mathbf{M}^{-1}\mathbf{f}_{\text{ext}}$（重力、ユーザーが加える力）。
2. **ブロードフェーズ**（broad phase）：バウンディングボックスが重なるペアを見つけます。安価で保守的です。
3. **ナローフェーズ**（narrow phase）：各ペアについて厳密な幾何計算を行います。接触しているか、どこで、どれだけ深く。
4. **接触マニフォールド**（contact manifold）：法線と貫通深さを共有する数個の接触点を作り、前フレームの接触と対応付けます。
5. **ウォームスタートと求解**：物体が互いにめり込まず、摩擦が成り立ち、関節がつながったままになるように、接触と関節の力積を計算します。
6. **位置の積分**：$\mathbf{x} \mathrel{+}= h\,\mathbf{v}$、$\mathbf{q} \leftarrow \text{normalize}\big(\mathbf{q} + \tfrac{h}{2}(0,\boldsymbol{\omega})\otimes\mathbf{q}\big)$。
7. **アイランド、スリープ、連続衝突検出、イベント**。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-step-pipeline.svg" caption="物理の 1 ステップ。上段は形状を接触に変換し（AABB → 候補ペア → 接触マニフォールド）、下段は接触を運動に変換します。現代のエンジン（Box2D v3、PhysX TGS、XPBD ソルバ）は、$h = dt/n$ のサブステップループ（紫の破線の枠）の中で求解と積分の段階を繰り返します。" %}

このステップには常に**固定の** $dt$（典型的には $1/60$ 秒）を使い、[第 01 回]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})のアキュムレータループで駆動します。可変タイムステップではソルバの振る舞いがフレームごとに変わり、決定性も失われます。

## 2. ブロードフェーズ：どのペアが接触しうるか

物体が $n$ 個あるとペアは $n(n-1)/2$ 個です。$n = 10{,}000$ なら 1 ステップあたり約 5000 万回の厳密テストが必要で、多すぎます。ブロードフェーズは各物体の**軸平行バウンディングボックス**（axis-aligned bounding box, AABB）を保持し、AABB が重なるペアだけを報告します。2 つの AABB が重なるのは、すべての軸で区間が重なるとき、かつそのときに限ります。

$$
\text{overlap}(a,b) \iff \bigwedge_{k \in \{x,y,z\}} \big(\text{lo}_{a,k} \le \text{hi}_{b,k}\ \wedge\ \text{lo}_{b,k} \le \text{hi}_{a,k}\big).
$$

### スイープ・アンド・プルーン

**スイープ・アンド・プルーン**（sweep and prune, SAP。sort and sweep とも呼ばれます）は、1 つの軸に沿って区間の端点をソートし、左から右へ走査します。その間、始まったがまだ終わっていない区間の「アクティブ」リストを保持します。ある区間が始まったとき、アクティブな区間のそれぞれと候補ペアになります。

```python
import numpy as np

def sweep_and_prune(lo, hi):
    """Pairs whose x-intervals overlap. lo, hi: (n, 2) box corners."""
    order = np.argsort(lo[:, 0])
    active, pairs = [], []
    for i in order:
        active = [j for j in active if hi[j, 0] >= lo[i, 0]]   # drop intervals that ended
        pairs += [(j, i) for j in active]
        active.append(i)
    return pairs

rng = np.random.default_rng(0)
n, L = 400, 100.0
c = rng.uniform(0, L, (n, 2)); r = rng.uniform(0.4, 1.2, (n, 2))
lo, hi = c - r, c + r
cand = sweep_and_prune(lo, hi)
true = [(a, b) for a, b in cand if lo[a, 1] <= hi[b, 1] and lo[b, 1] <= hi[a, 1]]
print(n * (n - 1) // 2, len(cand), len(true))   # all pairs, x-candidates, true AABB overlaps
```

なぜ効果があるのでしょうか。箱が幅 $L$ の世界に一様に散らばり、平均半幅が $\bar r$ なら、2 つの区間が $x$ 上で重なる確率は約 $4\bar r / L$ です。したがって候補数の期待値は約 $\tfrac{n^2}{2}\cdot\tfrac{4\bar r}{L}$ になります。物体数とともに世界が密度一定で大きくなる場合（2D では $L \propto \sqrt{n}$）、候補は $n^2$ ではなく $n^{1.5}$ で増え、本当の重なりは $n$ に比例して増えます。

実際に SAP を速くする工夫が 2 つあります。フレーム間で物体はわずかしか動かないので、ソート済みリストはほぼソートされたままであり、**挿入ソート**でほぼ $O(n)$ で直せます。また、エンジンは走査をやり直す代わりに、2 つの端点が入れ替わるたびに重なりの開始・終了イベントを記録します。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-sweep-and-prune.svg" caption="ランダムな箱に対するスイープ・アンド・プルーン（スクリプトの実際の実行結果）。左：40 個の箱。シーンの下の灰色の棒は走査順に並べた x 区間で、赤い箱は少なくとも 1 つの本当の AABB 重なりに含まれています。右：密度一定のもとでのペア数と $n$ の関係（両対数）。全ペアは $n^2$ で増え、SAP の x 候補は点線の見積もり $\frac{n^2}{2}\frac{4\bar r}{L}\propto n^{1.5}$ に沿い、本当の重なりはほぼ線形に増えます。青と赤の曲線の差はナローフェーズの無駄な仕事で、2 本目の軸や木構造で取り除けます。" %}

### 動的 AABB ツリー

多くの物体が走査軸に沿って並ぶ場合（たとえば長い木箱の列）、SAP は性能が落ちます。そのため現代のエンジンの多く（Box2D、Bullet、Jolt。PhysX は SAP などを選択可能）は**動的 AABB ツリー**を使います。これはバウンディングボリューム階層（bounding volume hierarchy, BVH、[グラフィックス第 05 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})を参照）で、葉にはマージンと予測移動量だけ拡大した**太った**（fat）AABB を置きます。物体はその太った箱から出たときだけ再挿入されます。挿入時には表面積の増加が最小になる兄弟ノードを選び（表面積ヒューリスティック）、木の回転でバランスを保ちます。ペアの問い合わせは木の同時下降で行います。オープンワールドでは、粒子や同じ大きさの物体が大量にある場合に**空間ハッシュ**（spatial hashing）や一様グリッドも加えます。

## 3. ナローフェーズ：厳密な接触

ナローフェーズは候補ペアごとに 3 つの問いに答えます。形状は交差しているか。**貫通深さ** $d$ はいくらか。**接触法線** $\mathbf{n}$ は何か。球-球、カプセル-カプセル、箱-箱には専用のルーチンがあり、一般の凸形状には分離軸定理か GJK を使います。

### 分離軸定理（SAT）

2 つの凸多面体が交わらないのは、射影が重ならない軸が存在するとき、かつそのときに限ります。2D の多角形なら、両方の多角形の辺の法線を調べれば十分です。3D の多面体では両者の面法線に加えて、すべての辺のペアの外積を調べます。重なりが最小の軸がそのまま $\mathbf{n}$ と $d$ を与えます。SAT は箱や小さな凸包の標準的な選択ですが、辺-辺の軸の数は形状の複雑さとともに急速に増えます。

### GJK：ミンコフスキー差による距離

形状 $A$ と $B$ の**ミンコフスキー差**（Minkowski difference）は

$$
A \ominus B = \{\, \mathbf{a} - \mathbf{b} \;:\; \mathbf{a}\in A,\ \mathbf{b}\in B \,\}
$$

です。$A$ と $B$ が凸ならこれも凸で、$A$ と $B$ が交わるのは**原点が $A \ominus B$ に含まれるとき、かつそのときに限ります**（ある $\mathbf{a} = \mathbf{b}$ が存在します）。より一般に、$A$ と $B$ の距離は原点から $A \ominus B$ までの距離に等しくなります。こうして衝突判定は「この凸集合は原点を含むか」という問いになります。

$A \ominus B$ を明示的に作ることはありません。**Gilbert–Johnson–Keerthi**（GJK）アルゴリズムが必要とするのは**サポート関数**（support function）、つまり方向 $\mathbf{d}$ に最も遠い形状上の点だけです。

$$
s_A(\mathbf{d}) = \arg\max_{\mathbf{a}\in A} \mathbf{a}\cdot\mathbf{d}, \qquad s_{A\ominus B}(\mathbf{d}) = s_A(\mathbf{d}) - s_B(-\mathbf{d}).
$$

多角形のサポート点は内積が最大の頂点、球なら $\mathbf{c} + r\,\mathbf{d}/\lVert\mathbf{d}\rVert$、カプセルなら線分のサポート点に球のサポート点を足したものです。GJK が同じコードで任意の凸形状を扱えるのはこのためです。

GJK はサポート点からなる**単体**（simplex）を成長させます。点、線分、三角形、3D ではさらに四面体です。

1. 任意の方向 $\mathbf{d}$ から始め、単体を $S = \{ s(\mathbf{d}) \}$ とし、$\mathbf{d} = -S_0$（原点の方向）とします。
2. 新しい点 $\mathbf{p} = s_{A\ominus B}(\mathbf{d})$ を求めます。$\mathbf{p}\cdot\mathbf{d} \le 0$ なら、$A\ominus B$ の方向 $\mathbf{d}$ で最も遠い点ですら原点に届かないので、原点は外側です。**衝突なし**。
3. $\mathbf{p}$ を $S$ に加えます。原点を含む領域に対応する部分単体（頂点、辺、または単体全体）だけを残し、その要素から原点へ向かう方向を $\mathbf{d}$ にします。
4. 単体が原点を囲んだら**衝突**です。そうでなければ 2 に戻ります。

2D では「辺 $\mathbf{ab}$ に垂直で原点を向く方向」をベクトル三重積 $(\mathbf{ab}\times\mathbf{ao})\times\mathbf{ab} = \mathbf{ao}\,(\mathbf{ab}\cdot\mathbf{ab}) - \mathbf{ab}\,(\mathbf{ab}\cdot\mathbf{ao})$ で計算します。アルゴリズム全体が 1 画面に収まります。

```python
import numpy as np

def support(P, d):
    return P[np.argmax(P @ d)]

def support_md(A, B, d):                 # support point of A - B
    return support(A, d) - support(B, -d)

def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]

def triple(a, b, c):                     # (a x b) x c = b (a.c) - a (b.c)
    return b * np.dot(a, c) - a * np.dot(b, c)

def do_simplex(s):
    """Keep the feature closest to the origin. Returns (contains_origin, simplex, new_direction)."""
    if len(s) == 2:
        b, a = s                         # a is the newest point
        ab, ao = b - a, -a
        if np.dot(ab, ao) > 0:
            d = triple(ab, ao, ab)       # normal of ab towards the origin
            if np.dot(d, d) < 1e-20:     # origin lies on the segment
                return True, [b, a], None
            return False, [b, a], d
        return False, [a], ao
    c, b, a = s
    ab, ac, ao = b - a, c - a, -a
    if abs(cross2(ab, ac)) < 1e-12:      # degenerate triangle
        return do_simplex([b, a])
    ab_perp = triple(ac, ab, ab)         # normal of ab, away from c
    ac_perp = triple(ab, ac, ac)         # normal of ac, away from b
    if np.dot(ab_perp, ao) > 0:
        return False, [b, a], ab_perp
    if np.dot(ac_perp, ao) > 0:
        return False, [c, a], ac_perp
    return True, s, None                 # origin inside the triangle

def gjk(A, B, max_iter=32):
    d = A.mean(0) - B.mean(0)
    if np.dot(d, d) < 1e-20:
        d = np.array([1.0, 0.0])
    simplex = [support_md(A, B, d)]
    d = -simplex[0]
    for _ in range(max_iter):
        if np.dot(d, d) < 1e-20:
            return True, simplex
        p = support_md(A, B, d)
        if np.dot(p, d) <= 0:            # p did not pass the origin: separated
            return False, simplex
        hit, simplex, d = do_simplex(simplex + [p])
        if hit:
            return True, simplex
    return False, simplex

A = np.array([[0.0, 0.0], [3.0, 0.5], [3.5, 2.5], [1.0, 3.0]])
B = np.array([[2.5, 1.5], [5.0, 1.0], [4.0, 3.5]])
print(gjk(A, B)[0], gjk(A, B + [3.0, 0.0])[0])   # True (overlap), False (B moved right)
```

2 つ目のテストでは $B$ を右に 3 単位動かしています。すると $B$ の最も左の頂点は $x = 5.5$ にあり、$A$ の最も右の点 $3.5$ より外側なので、2 つの答えは幾何から直接決まります。下の図は、重なっているペアについて単体が変化していく様子です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-gjk-simplex.svg" caption="コード中の 2 つの多角形に対する GJK（スクリプトで計算）。左：ワールド空間の $A$（青）と $B$（橙）。続くパネルは反復ごとの $A\ominus B$（紫）と原点（黒丸）で、赤が現在の単体、緑が次の探索方向 $\mathbf{d}$ です。新しいサポート点はいずれも $A\ominus B$ の $\mathbf{d}$ 方向に最も遠い頂点で、三角形が原点を囲んだところでループが止まります。GJK は紫の多角形そのものを作らず、必要な数個の頂点だけを訪れます。" %}

実用の GJK（Bullet、Jolt、PhysX、Box2D の距離ルーチン）は、形状が離れているときに**最近点**も返します。また、形状を小さな**マージン**（丸めの半径）だけ膨らませて実行するので、静止接触は深い貫通の問題ではなく「マージン未満だけ離れている」という安価な問い合わせになります。

### EPA：どれだけ深く、どの方向に？

GJK が衝突を報告しても、まだ $\mathbf{n}$ と $d$ が必要です。貫通深さは原点から $A\ominus B$ の**境界**までの距離で、形状を分離する最小の平行移動は $d\,\mathbf{n}$ です。ここで $d\,\mathbf{n}$ は境界上で原点に最も近い点です。**拡張多面体アルゴリズム**（Expanding Polytope Algorithm, EPA、van den Bergen 2001）は、原点を含む GJK の最後の単体から始め、次の 3 つを繰り返します。

1. 原点に最も近い多面体の辺（3D では面）を見つけます。その外向き法線を $\mathbf{n}$、距離を $d$ とします。
2. $\mathbf{p} = s_{A\ominus B}(\mathbf{n})$ を問い合わせます。
3. $\mathbf{p}\cdot\mathbf{n} - d < \varepsilon$ なら、その辺は $A\ominus B$ の境界上にあるので終了です。そうでなければ $\mathbf{p}$ を挿入し（辺が 2 つに分かれます）、繰り返します。

```python
def epa(A, B, simplex, tol=1e-9, max_iter=64):
    """Penetration normal n and depth: moving B by depth * n makes A and B touch."""
    poly = [np.asarray(p, float) for p in simplex]
    while len(poly) < 3:                 # origin on an edge: add a support point
        e = poly[-1] - poly[0] if len(poly) == 2 else np.array([1.0, 0.0])
        poly.append(support_md(A, B, np.array([-e[1], e[0]])))
    if cross2(poly[1] - poly[0], poly[2] - poly[0]) < 0:
        poly[1], poly[2] = poly[2], poly[1]          # counter-clockwise
    for _ in range(max_iter):
        best = None
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            e = b - a
            n = np.array([e[1], -e[0]]) / np.linalg.norm(e)   # outward normal (CCW)
            if best is None or np.dot(n, a) < best[0]:
                best = (np.dot(n, a), n, i)
        dist, n, i = best
        p = support_md(A, B, n)
        if np.dot(p, n) - dist < tol:
            return n, dist
        poly.insert(i + 1, p)
    return n, dist

hit, s = gjk(A, B)
n, depth = epa(A, B, s)
print(n, depth)
```

符号の約束を簡単な場合で確かめましょう。$A$ が左にあり、$B$ が右から重なっているとき、$A\ominus B$ の大部分は $x$ が負の側にあり、$+x$ 側でわずかに原点を越えています。EPA は $\mathbf{n} = (+1, 0)$ を返し、$B$ を $d\,\mathbf{n}$ だけ押すと右へ動いて $A$ から抜け出します。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-epa.svg" caption="同じペアに対する EPA（スクリプトの出力）。最初のパネル：開始時の多面体は GJK の最後の三角形（赤）です。中央：最終的な多面体で、最も近い辺が $A\ominus B$ の境界上にあります。原点からの緑の矢印が貫通ベクトル $d\,\mathbf{n}$ です。右：$B$（破線は元の位置）を $d\,\mathbf{n}$ だけ動かすと、2 つの形状はちょうど接触します。" %}

自分で試してみましょう。形状をドラッグし、GJK を 1 ステップずつ進めてください。

{% include widget.liquid name="graphics-engine-gjk" height="420" caption="ワールドビューで $A$ または $B$ をマウスや指でドラッグします。2 つ目のビューは $A\ominus B$（紫）と原点 O を表示します。ステップボタンで GJK を再生できます。赤が単体、緑が探索方向 $\mathbf{d}$ です。形状が重なっていると、最後のステップで EPA の多面体（赤の破線）と貫通ベクトルが表示され、ワールドビューには $d\,\mathbf{n}$ だけ押し出された $B$（破線）が表示されます。「B を変更」で $B$ の形が切り替わります。形状が触れ始める瞬間に、原点が $A\ominus B$ の境界を横切ることを確かめてください。" %}

GJK と EPA は高速で汎用的ですが、EPA は 3D では数値的に繊細です。多面体を凸に保つ必要があり、ほぼ同一平面上の面が問題を起こします。そのためエンジンは箱や凸包に SAT を使い、面をクリッピングして複数の接触点を得ることがよくあります。

## 4. 接触マニフォールドとウォームスタート

地面に置かれた箱は 1 点ではなく面で接触します。接触点が 1 つだけだと箱は揺れてしまいます。そこでナローフェーズは**接触マニフォールド**を作ります。3D で最大 4 点（2D で 2 点）が 1 つの法線 $\mathbf{n}$ を共有し、各点がそれぞれの深さ $d_i$ を持ちます。2 つの箱の場合、標準的な方法は $\mathbf{n}$ に最もそろった**参照面**（reference face）を取り、もう一方の箱の**入射面**（incident face）を参照面の側面の平面でクリッピングし（Sutherland–Hodgman クリッピング）、参照面より上にある点を捨てることです。1 フレームに 1 点しか接触点がない曲面形状では**永続マニフォールド**（persistent manifold）を使い、過去のフレームの点が有効な間はそれを保持します。

各接触点には**特徴 ID**（たとえば「箱 A の頂点 2 対 箱 B の面 0」）が付きます。次のフレームに同じ特徴ペアがあれば、ソルバは前フレームの力積から始めます。これが**ウォームスタート**（warm starting）です。静止した積み重ねでは力積はフレーム間でほとんど変わらないので、前回の答えから始めれば、少ない反復でもコールドスタートの多数回の反復と同じくらい良い結果になります。

## 5. 拘束ソルバ

### 接触を速度拘束として書く

法線 $\mathbf{n}$ の接触点では、ギャップ $C \ge 0$ が非負のままでなければなりません。その変化率は、並べた速度 $\mathbf{u} = (\mathbf{v}_A, \boldsymbol{\omega}_A, \mathbf{v}_B, \boldsymbol{\omega}_B)$ について線形です。

$$
\dot C = \mathbf{J}\mathbf{u}, \qquad \mathbf{J} = \big(-\mathbf{n}^\top,\ -(\mathbf{r}_A\times\mathbf{n})^\top,\ \mathbf{n}^\top,\ (\mathbf{r}_B\times\mathbf{n})^\top\big).
$$

ここで $\mathbf{r}_A, \mathbf{r}_B$ はそれぞれの重心から接触点へのベクトルです。接触は押すことしかできないので、力積 $\lambda$ は**相補性**（complementarity）条件

$$
\lambda \ge 0, \qquad \mathbf{J}\mathbf{u}^+ + b \ge 0, \qquad \lambda\,(\mathbf{J}\mathbf{u}^+ + b) = 0
$$

を満たします。$\mathbf{u}^+$ は力積を加えた後の速度、$b$ はバイアス項です。言葉で言えば、物体が離れて力積が 0 になるか、接触を保って力積が正になるかのどちらかです。すべての接触をまとめると**線形相補性問題**（linear complementarity problem, LCP）になります。摩擦は接触ごとに接線方向の行を 2 つ加え、$\lvert\lambda_t\rvert \le \mu\lambda_n$（クーロン摩擦円錐の箱型近似）を課します。

### 逐次インパルス = 射影ガウス・ザイデル（PGS）

拘束を 1 つずつ解けば十分です。力積 $\Delta\lambda$ を加えると速度は $\mathbf{M}^{-1}\mathbf{J}^\top\Delta\lambda$ だけ変わります。$\mathbf{J}\mathbf{u}^+ + b = 0$ を課すと

$$
\Delta\lambda = -\frac{\mathbf{J}\mathbf{u} + b}{\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^\top} = -m_{\text{eff}}\,(\mathbf{J}\mathbf{u} + b), \qquad m_{\text{eff}} = \big(\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^\top\big)^{-1}
$$

が得られます。そして増分ではなく**累積**力積をクランプします。$\lambda \leftarrow \max(0, \lambda + \Delta\lambda)$ とし、実際に生じた変化だけを適用します。すべての拘束を何度か走査するのが LCP に対する**射影ガウス・ザイデル法**（projected Gauss–Seidel）で、Catto の GDC 2005 の講演が**逐次インパルス**（sequential impulses）という名前で広めました。バイアス $b = \tfrac{\beta}{h}\min(0, C)$ は **Baumgarte 安定化**と呼ばれ（$\beta \approx 0.1$〜$0.2$）、めり込んだ物体を押し離します。

質量 $m = 1$ kg の箱が 1 つ、貫通なしで地面に静止しているとします（$h = 1/60$ 秒）。重力により $v = -9.81/60 \approx -0.1635$ m/s です。$\mathbf{J} = (1)$、$m_{\text{eff}} = 1$ なので $\Delta\lambda = -(-0.1635) = 0.1635$ N·s となり、ちょうど $m g h$、つまり地面がこのステップの間に重さを支えた分です。箱 1 つなら 1 回の反復で収束しますが、積み重ねではそうはいきません。

### 箱の積み重ね実験

以下は、高さ 1 の箱 $n$ 個を 1 次元に積み重ねたもののソルバで、接触 $k$ は箱 $k-1$（または地面）と箱 $k$ をつなぎます。次の 2 つの図はこのトイ実験から作っています。

```python
import numpy as np

def stack(n=10, top_mass=10.0, iters=10, substeps=1, warm=False, frames=120, dt=1/60, beta=0.2):
    m = np.ones(n); m[-1] = top_mass; w = 1 / m          # inverse masses
    y = np.arange(n) + 0.5; v = np.zeros(n); lam = np.zeros(n)
    h = dt / substeps
    for _ in range(frames * substeps):
        v -= 9.81 * h                                     # integrate gravity
        gap = np.concatenate([[y[0] - 0.5], np.diff(y) - 1.0])
        if warm:                                          # re-apply last impulses
            v += w * lam; v[:-1] -= w[:-1] * lam[1:]
        else:
            lam[:] = 0
        for _ in range(iters):                            # projected Gauss-Seidel
            for k in range(n):
                jv = v[k] - (v[k - 1] if k else 0.0)      # relative normal velocity
                keff = w[k] + (w[k - 1] if k else 0.0)    # J M^-1 J^T
                dl = -(jv + beta / h * min(0.0, gap[k])) / keff
                new = max(0.0, lam[k] + dl)               # clamp the accumulated impulse
                dl, lam[k] = new - lam[k], new
                v[k] += w[k] * dl
                if k: v[k - 1] -= w[k - 1] * dl
        y = y + h * v                                     # integrate positions
    gap = np.concatenate([[y[0] - 0.5], np.diff(y) - 1.0])
    return max(0.0, -gap.min())                           # worst penetration (m)

for kw in [dict(iters=10), dict(iters=10, warm=True), dict(iters=1, substeps=10, warm=True)]:
    print(kw, f"{stack(**kw) * 1000:.3f} mm")
```

なぜ積み重ねは難しいのでしょうか。ガウス・ザイデル法は 1 回の走査で情報を接触 1 つ分しか伝えません。一番上の箱の重さは、その下のすべての接触を通って地面に届かなければならないので、$n$ 個の積み重ねにはおよそ $n$ 回の走査が必要で、質量が異なるとさらに多く必要です。軽い箱の上に重い箱があると、有効質量の比のせいで 1 回の走査では必要な修正のごく一部しか伝わりません。残りは沈み込みとして現れ、それを Baumgarte が押し戻します。図はそれを測ったものです。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-stack-solvers.svg" caption="10 個の箱のトイ積み重ね。どのソルバも 1/60 秒のフレームあたり 10 回の拘束走査という同じコストです（スクリプトの出力）。左：一番上の箱が 10 倍重いときの 2 秒間の最大貫通。右：静止時の貫通（最後の 0.5 秒の平均）、質量比 1:1、1:10、1:100（対数軸）。素の PGS（赤）、ウォームスタート付き（橙）、サブステップ（青。サブステップごとに 1 回走査し、TGS や Box2D の soft step に相当）、XPBD（紫）を比べてください。ウォームスタートとサブステップは、伝播の遅さに対抗するためにエンジンが使う 2 つの道具です。" %}

### TGS、soft step、XPBD：ここでも小さなステップ

現代のソルバは同じ予算の使い方が違います。1 ステップで $N$ 回反復する代わりに、大きさ $h = dt/N$ の**サブステップ**（substep）を $N$ 回行い、各サブステップで 1 回（または数回）反復し、サブステップごとに最新の位置でギャップ $C$ を評価し直します。PhysX はこれを **Temporal Gauss–Seidel**（TGS）と呼び、そのドキュメントは TGS を大きな質量比に強く、反復あたりのコストは PGS よりわずかに高いと説明しています。Box2D v3 のソルバは **soft step** と呼ばれ、同じことを**ソフト拘束**（soft constraint）で行います。小さなステップの XPBD（[グラフィックス第 07 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）は、同じ考え方の位置レベル版です。Erin Catto のブログ記事 *Solver2D*（2024）は、こうしたソルバ 8 種（PGS、TGS の変種、soft step、XPBD など）を同じテストシーンで比較しており、この話題で最も実践的な読み物です。

**ソフト拘束**は剛な拘束を、固有振動数 $\omega = 2\pi f$、減衰比 $\zeta$ の陰的なばね・ダンパに置き換えます。そのため振る舞いがステップ幅や反復回数に依存しません。有効質量 $m$ に対してばね定数を $k = m\omega^2$、減衰係数を $c = 2m\zeta\omega$ と書きます。これをステップ $h$ で陰的に積分し、力積にステップ終了時のギャップ $C + h\,\mathbf{J}\mathbf{u}^+$ と速度 $\mathbf{J}\mathbf{u}^+$ を使います（$\mathbf{J}\mathbf{u}^+ = \mathbf{J}\mathbf{u} + \lambda/m$）。

$$
\lambda = -h\Big(k\,(C + h\,\mathbf{J}\mathbf{u}^+) + c\,\mathbf{J}\mathbf{u}^+\Big).
$$

これを $\lambda$ について解くと、数行の代数で

$$
\lambda = -m\,\underbrace{\frac{a}{1+a}}_{\text{mass scale}}\Big(\mathbf{J}\mathbf{u} + \underbrace{\frac{\omega}{2\zeta + h\omega}}_{\text{bias rate}}\, C\Big), \qquad a = h\omega\,(2\zeta + h\omega)
$$

となります。PGS と比べると、バイアスレート（bias rate）がその場しのぎの $\beta/h$ に代わり、1 未満のマススケール（mass scale）が応答を柔らかくします。Box2D v3 はヘルツ単位の剛性と減衰比からこれらの係数を計算するので、接触はわずかに柔らかいものの、どのステップ幅でも安定して振る舞います。振動数をサブステップの周波数の一定割合まで上げれば、拘束は実質的に剛になります。

次の図は、ウォームスタートなし、フレームあたりの走査回数を同じにしたうえで、サブステップの効果だけを取り出したものです。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-substeps-vs-iterations.svg" caption="同じ予算、違う配分（スクリプトの出力。ウォームスタートなし、一番上の箱は 10 倍の重さ）。左：フレームあたりの拘束走査回数 $N$ に対する静止時の貫通。予算を 1 ステップ × $N$ 回反復（赤）に使うか、$N$ サブステップ × 1 回反復（青）に使うか。右：$N=8$ で 2 秒後の 2 つの積み重ね。点線は一番上の箱の正確な静止高さです。" %}

### ステップの残りの部分

- **アイランドとスリープ。** 接触や関節でつながった物体は**アイランド**（island）を作ります（拘束グラフ上の Union-Find で求めます）。アイランド内のすべての物体の速度がしばらく（約 0.5 秒）しきい値以下にとどまると、アイランドはスリープし、何かが触れるまで計算コストがかかりません。アイランドはマルチスレッド化の自然な単位でもあります。
- **連続衝突検出（CCD）。** 1 ステップに 1 m 進む弾丸は厚さ 10 cm の壁をすり抜けます。これが**トンネリング**（tunneling）です。エンジンは**推測接触**（speculative contacts）を使い、ギャップがこのステップの移動距離より小さければ、接触が起きる前に接触を追加します。また、形状を運動に沿ってスイープし、保守的前進法（conservative advancement）で**衝突時刻**（time of impact, TOI）を求め、速い物体をサブステップします。Box2D v3 は「弾丸」物体に推測接触と TOI の両方を使います。
- **決定性。** ロックステップ方式のマルチプレイやリプレイでは、ビット単位で同一の結果が必要です。そのためには固定の $dt$、固定された拘束の順序（ポインタやスレッドの終了順ではなく物体 ID でソート）、決定的な並列リダクション、そしてコンパイラ間での積和融合（FMA）や超越関数への注意が必要です。Box2D v3 と Jolt は、文書化された条件のもとでクロスプラットフォームの決定性をうたっています。

### 出会うことになるエンジン

2026 年 11 月時点の状況です（バージョンは各プロジェクトのリリースページより）。

| エンジン | 言語 | ライセンス | 備考 |
| --- | --- | --- | --- |
| **NVIDIA PhysX 5**（5.x） | C++ | BSD-3-Clause | PGS と TGS のソルバ、GPU 剛体、縮約座標の多関節体、粒子/PBD。Omniverse と Isaac Sim の物理 |
| **Havok Physics** | C++ | 商用（2015 年から Microsoft が所有） | 長い実績のある AAA 向けミドルウェア。Unreal 用プラグインもあります |
| **Jolt Physics**（5.6.0、2026 年 7 月） | C++17 | MIT | マルチスレッド、決定的。『Horizon Forbidden West』や『DEATH STRANDING 2』で使用。Godot 4.4 以降はオプションとして組み込み |
| **Chaos** | C++ | Unreal Engine の一部（Epic EULA） | Unreal Engine 5 の標準物理。剛体、破壊、布、車両、ネットワーク物理 |
| **Box2D v3**（3.2.0、2026 年 10 月） | C17 | MIT | 2D。soft step ソルバ、SIMD、マルチスレッド、クロスプラットフォーム決定性 |
| **Rapier**（0.36、2026 年 10 月） | Rust | Apache-2.0 | 2D と 3D。ネイティブでも、WebAssembly でブラウザでも動作 |

Unreal、Unity、Godot がこれらのエンジンをゲームプレイのコードにどう公開しているかは[第 04 回]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})を参照してください。

## 6. 関節と多関節体

**関節**（joint）は 2 つの物体の間の拘束です。ヒンジは 6 つの相対自由度のうち 5 つを取り除き、球関節は 3 つ、直動関節も 5 つを取り除きますが、スライドは許します。ゲームエンジンは関節を接触とまったく同じように扱います。$\mathbf{J}$ に行を追加し、同じ PGS/TGS ループで解きます。これが**最大座標**（maximal coordinates）で、各物体が 6 自由度を保ち、拘束がそれらをつなぎ止めようとします。

ロボットは長い連鎖です。7 自由度のアーム、30 以上の関節を持つヒューマノイド、20 自由度の手などがあります。重いベースと軽い指、あるいは軽いリンクが重い荷物を持つ場合など、質量比が大きいこともよくあります。最大座標では関節の誤差はすべて反復ソルバが取り除かなければならず、残った誤差は**関節のドリフト**として現れます。リンクが目に見えて離れたり、負荷で連鎖が伸びたりします。

**縮約**（一般化）**座標**（reduced / generalized coordinates）は、構成上この問題を取り除きます。状態は関節角のベクトル $\mathbf{q}$（とベースの姿勢）なので、関節が外れることはありません。運動方程式は

$$
\mathbf{M}(\mathbf{q})\,\ddot{\mathbf{q}} + \mathbf{c}(\mathbf{q},\dot{\mathbf{q}}) = \boldsymbol{\tau} + \mathbf{J}_c^\top\boldsymbol{\lambda}_c
$$

となります。ここで質量行列は姿勢に依存し $\mathbf{M}(\mathbf{q}) = \sum_i m_i\,\mathbf{J}_i^\top\mathbf{J}_i$（に回転の項を加えたもの）、$\mathbf{c}$ はコリオリ項と重力項、$\boldsymbol{\tau}$ は関節トルク、$\boldsymbol{\lambda}_c$ は接触力積です。**Featherstone** の多関節体アルゴリズム（articulated-body algorithm, ABA）は、$n$ 個のリンクからなる木について、$\mathbf{M}$ を作らずに $\ddot{\mathbf{q}}$ を $O(n)$ で計算します。複合剛体アルゴリズム（CRBA）は $\mathbf{M}$ を $O(n^2)$ で作り、再帰ニュートン・オイラー法（RNEA）は逆動力学を計算します。制御器もこれらの量を必要とします。質量行列、重力トルク、ヤコビアンはロボット制御器が扱う対象そのものです。

図は、軽いリンクと重い先端質量を持つ 4 リンクの振り子で、両方の定式化を動かしたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-articulated-chain.svg" caption="4 リンクの連鎖（リンクの質量は 1、1、1、先端が 50 kg）を、鉛直から 69° の伸びた状態で放します。紫の丸：縮約座標（関節角、RK4 なのでリンク長は厳密）。橙の四角：最大座標（質点と距離拘束、コンプライアンス 0 の XPBD、1 フレームに 1 ステップ・1 反復）を同じ時刻で表示。右：最大座標の連鎖について、1 ステップあたり 1、4、32 回反復したときのリンク長の最大相対誤差。縮約座標の連鎖は構成上誤差 0 で、最大座標の連鎖がそれに近づくには多くの反復が必要です。" %}

これがロボットシミュレータとゲームエンジンが異なる理由です。MuJoCo や Drake は一般化座標で動作し、PhysX には別の**縮約座標多関節体**（reduced-coordinate articulation）型があり、Isaac Sim はそれをロボットに使います。Unity はそれを `ArticulationBody` として公開しています。一方、ゲームのキャラクターに厳密な関節が必要になることはまれで、1% 伸びるラグドールは見ても分かりません。ロボット学習には逆のトレードオフが必要です。厳密な関節、正確なアクチュエータと接触、そして $\mathbf{M}(\mathbf{q})$ とその微分を計算できることです。背景となるロボットの運動学は[身体性 AI 第 01 回]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})で扱っています。

## 7. アニメーションのランタイム

キャラクターを動かすのは物理だけではありません。エンジンの**アニメーションシステム**は、通常フレームの中で物理より前に動きます。

- **ステートマシン**（state machine）は、ゲームプレイの状態（待機、歩き、走り、ジャンプ）から現在のアニメーションクリップを選びます。ブレンド時間と条件付きの遷移を含みます。
- **ブレンドツリー**（blend tree）はパラメータでクリップを混ぜます。速度による歩きと走りの 1D ブレンドや、速度方向による 2D ブレンドスペースなどです。関節の回転はクォータニオン補間で混ぜます。
- **逆運動学**（inverse kinematics, IK）はブレンド後の姿勢を補正します。凸凹の地面に足を合わせる 2 ボーン IK、頭の look-at、長い連鎖には FABRIK や CCD を使います。
- **モーションマッチング**（motion matching）は手作りのグラフを探索で置き換えます。数フレームごとに、大きなモーションキャプチャのデータベースから、姿勢と未来の軌道が現在の状態とプレイヤーの入力に最も合うフレームを探し、そこへブレンドします。学習型の変種はデータベースをニューラルネットワークで圧縮します。
- **物理ベースのアニメーション**は 2 つの世界を組み合わせます。アクティブラグドールは PD 制御器でアニメーションの目標に追従し、強化学習で得た制御器（[身体性 AI 第 02 回]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})）がシミュレーションされたキャラクターを動かします。

数学（スプライン、クォータニオンのブレンド、スキニング、IK ソルバ、モーションマッチングの特徴量）は[グラフィックス第 09 回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})にあります。エンジンにとって重要なのはフレーム内の順序です。アニメーションが目標姿勢を作り、物理（ラグドール、布、髪）が反応し、レンダラが最終姿勢をスキニングします。

## 8. ロボットと AI のシミュレータとしてのエンジン

ロボット学習のスタックには、ゲームエンジンが持っているもの（シーン、アセット、レンダリング、ステップループ、ツール）に加えて、ゲームエンジンが重視しない 3 つのものが必要です。

1. **精度と忠実度**：厳密な関節、アクチュエータのモデル（モータ、減速比、PD ゲイン、トルク制限）、実機に合う摩擦と接触のモデル、そして現実的なノイズを持つセンサ（カメラ、深度、LiDAR、IMU、力覚）。
2. **スループット**：強化学習には数十億ステップが必要なので、世界のコピー何千個分もを GPU 上で一緒に進め、観測と行動は GPU テンソルに置いたままにします。
3. **微分可能性**：次の状態の、現在の状態・行動・パラメータに関する勾配。システム同定、軌道最適化、学習に使います。

2026 年 11 月時点の状況です（バージョンはリリースページと公式発表、ライセンスはリポジトリより）。

| プラットフォーム | 基盤 | 追加するもの | 状況（2026 年 11 月） |
| --- | --- | --- | --- |
| **Isaac Sim**（NVIDIA） | Omniverse Kit、PhysX 5、RTX レンダラ、OpenUSD | フォトリアルな RTX センサ（カメラ、LiDAR、レーダー）、Replicator による合成データ、ロボットのインポータ（URDF/MJCF から USD へ） | v6.2（2026 年 10 月）。ソースは GitHub で公開（リポジトリのコードは Apache-2.0、依存する Omniverse Kit SDK は別ライセンス） |
| **Isaac Lab**（NVIDIA） | Isaac Sim、Newton バックエンド | GPU 並列の強化学習・模倣学習環境、タスク、センサ、sim-to-real のワークフロー | v3.0（2026 年 10 月）、BSD-3-Clause |
| **MuJoCo**（Google DeepMind） | 独自エンジン | 一般化座標、凸のソフト接触、腱、アクチュエータ。CPU で非常に正確かつ高速 | 3.17（2026 年 10 月）、Apache-2.0 |
| **MJX** | JAX 版 MuJoCo、または MuJoCo Warp 上 | アクセラレータ上でバッチ化・`jit` コンパイルされた MuJoCo。JAX バックエンドは微分可能、Warp バックエンドは微分不可 | MuJoCo と一緒に配布 |
| **MuJoCo Warp** | NVIDIA Warp | 接触の多いシーンまでスケールする GPU 版 MuJoCo。Google DeepMind と NVIDIA が開発し、Newton にも含まれる | MuJoCo とバージョンをそろえて配布（3.17） |
| **MuJoCo Playground** | MJX | sim-to-real のレシピ付きの歩行・操作環境 | arXiv 2502.08844（2025） |
| **Newton** | NVIDIA Warp、OpenUSD | オープンで拡張可能な GPU 物理。複数のソルバ（MuJoCo Warp を含む）、微分可能な部品、ロボティクス向け | Disney Research、Google DeepMind、NVIDIA が Linux Foundation に寄贈（2025 年 9 月）。1.0 は 2026 年 3 月、v1.7 は 2026 年 10 月。Apache-2.0 |
| **Genesis** | 独自エンジン（Python フロントエンド） | 剛体、MPM、SPH、FEM、PBD のソルバを 1 つの枠組みに統合、独自レンダラ、GPU 並列 | v1.4（2026 年 10 月）、Apache-2.0。論文はなく、リポジトリを引用 |
| **ManiSkill3** | SAPIEN（PhysX） | 操作ベンチマーク向けの GPU 並列シミュレーション*と*レンダリング | v3.0.1（2026 年 4 月）。arXiv 2410.00425 |
| **Habitat 3.0**（Meta） | Habitat-Sim（Bullet + 独自レンダラ） | 高速な屋内ナビゲーションと再配置、ヒューマノイドアバター、ヒューマン・イン・ザ・ループ | ICLR 2024。habitat-sim 0.3.3（2026 年 2 月） |
| **CARLA** | Unreal Engine | 自動運転：街、交通、天候、センサ一式 | 0.10.0 で Unreal Engine 5.5 に移行（2024 年 12 月）。0.9.16（2025 年 9 月）が UE4 ベースの最新リリース |
| **Unity ML-Agents** | Unity | 任意の Unity シーンを Python API 付きの強化学習環境に変える | Release 23（2025 年 9 月） |

ゲームエンジンから借りているもの：シーングラフとアセット形式（USD、glTF、URDF インポータ）、リアルタイムレンダラ（RTX、Unreal、Unity）、エディタとツール、そして本記事のステップパイプラインです。それぞれが加えているもの：

- **精度**：MuJoCo の凸接触モデルと一般化座標、Isaac の PhysX 多関節体、陰的なアクチュエータモデル。
- **大規模並列性**：Isaac Gym の「テンソルを GPU に置いたまま」という設計（Isaac Lab、ManiSkill3、MJX、MuJoCo Warp、Genesis、Newton）。四足ロボットの世界 1 万個が並列に動き、歩行方策が数分で学習できます。設計上の変化は**バッチ次元**（batch dimension）です。オブジェクトがそれぞれ自分でステップするのではなく、データ指向のレイアウト（[第 01 回]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})）で、各段階を全世界に対する 1 つのカーネルとして実行します。
- **微分可能性**：MJX（JAX）、Warp の自動微分、Genesis、Newton の一部。接触は勾配をノイズの多いものや不連続なものにします。これは[微分可能レンダリング]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})における可視性の不連続性と対応する問題です。

MuJoCo/MJX の実践例と、これらのプラットフォーム上のベンチマークは[身体性 AI 第 03 回]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})にあります。

## 9. シーン記述としての OpenUSD

ロボットシミュレータ、デジタルツイン、映画のパイプラインはどれも、glTF（配信用の形式、[第 03 回]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})を参照）にはない 1 つのものを必要とします。多くの人とツールが同じ大きなシーンを、**互いに上書きせずに**編集できることです。**OpenUSD**（Universal Scene Description、2016 年に Pixar がオープンソース化）は、レイヤーとコンポジションでこれを解決します。

- **ステージ**（stage）は合成されたシーンです。**prim** の木（`/World/Robot/base_link` のようなパス）で、各 prim は**属性**（型付きで、時間サンプルも持てる値）と**リレーションシップ**を持ちます。
- **レイヤー**（layer）は 1 つのファイル（`.usda` テキスト、`.usdc` バイナリ、`.usdz` パッケージ）で、prim についての**オピニオン**（opinion）を保持します。レイヤーは積み重なり、強いレイヤーのオピニオンが勝ちます。ライティング担当のレイヤーとレイアウト担当のレイヤーは別ファイルで、1 つのルートにサブレイヤーとして入ります。強いレイヤーにある非破壊的な **over** は、アセットに触れずに属性を 1 つだけ変更できます。
- **コンポジションアーク**（composition arcs）は、他のファイルや代替案をシーンに取り込みます。**リファレンス**（references。アセットファイルをインスタンス化）、**ペイロード**（payloads。巨大なシーン向けの、読み込まずにおけるリファレンス）、**バリアントセット**（variant sets。グリッパの種類や壊れた/無傷の状態など、切り替え可能な代替案）、**インヘリット**（inherits）と**スペシャライズ**（specializes。クラスのような共有）があります。これらは **LIVRPS** の強さの順、つまり Local、Inherits、Variants、References、Payloads、Specializes で解決されます。現在の用語集は **relocates** を加えて LIVERPS と書いています。
- **スキーマ**（schemas）は prim に型付きの意味を与えます。`UsdGeom`（メッシュ、変換）、`UsdShade`（マテリアル）、`UsdLux`（ライト）、そして **`UsdPhysics`**（剛体、コライダ、質量、関節、多関節体、衝突グループ）です。エンジンやシミュレータはこれを拡張します。PhysX 固有のスキーマがその例です。

```usda
#usda 1.0
(
    subLayers = [@./lighting.usda@, @./layout.usda@]
)

over "World"
{
    over "Robot" (
        prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsMassAPI"]
        variants = { string gripper = "parallel" }
    )
    {
        float physics:mass = 3.0
    }
}
```

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-usd-composition.svg" caption="1 つの prim `/Robot` のコンポジション。レイヤースタック（上）は最も強いもの（セッションレイヤー）から弱いものの順に並びます。`layout.usda` はアセット `robot.usd` を参照しており、そのアセットは独自の質量、バリアントセット、ペイロードを持ちます。解決された prim（右下）では、`physics:mass = 3.0` がルートレイヤーの `over` から来て、参照アセット内の 2.0 に勝ちます。色はセッションレイヤーから来ます。1 つの prim の中では、アークは LIVRPS の順で解決されます。" %}

ロボティクスが USD を採用した理由は、1 つの USD ステージに、CAD 由来の工場の幾何、RTX レンダリング用のマテリアル、シミュレーション用の物理特性、センサの定義、合成データ用の意味ラベルをまとめて持てるからです。各チームは自分のレイヤーを編集します。NVIDIA は USD の上に Omniverse と Isaac Sim を構築し、Newton も USD を読み込みます。**Alliance for OpenUSD**（AOUSD。2023 年に Pixar、Adobe、Apple、Autodesk、NVIDIA が Linux Foundation の下で設立）は 2025 年 12 月に **Core Specification 1.0** を公開しました。これはデータモデルとコンポジションの最初の規範的な定義です。OpenUSD 自体は現在「年.月」形式のバージョン番号を使っています（2026 年 10 月時点で v26.11）。

## 10. 合成データとドメインランダム化

エンジンは**データ工場**でもあります。正解を最初から知っているレンダラは、RGB と一緒に深度、法線、セグメンテーション、2D/3D ボックス、姿勢、オプティカルフローを、完全なラベル付きで、いくらでも出力できます。問題は **sim-to-real ギャップ**です。レンダリング画像の統計が写真と違うため、レンダリング画像で学習したネットワークが写真では失敗することがあります。グラフィックスの側から見ると、ギャップには具体的な原因があります。

- **マテリアル**：測定した BRDF ではなく手で設定したアルベドとラフネス。摩耗、ほこり、指紋、表面下散乱がありません。
- **ライティング**：複雑な間接光、面光源、実際の HDR 環境ではなく、太陽 1 つと環境項だけ。画面外の物体が落とす影がありません。
- **カメラとセンサ**：レンズ歪み、モーションブラー、ローリングシャッター、ノイズ、自動露出、ホワイトバランス、JPEG のアーティファクトがありません。深度センサでは、エッジや光沢面での欠損画素がありません。
- **幾何とコンテンツ**：きれいすぎ、物体の種類が少なすぎ、配置が不自然。

戦略は 2 つあり、実践では両方を組み合わせます。**フォトリアリズム**はギャップを縮めます。パストレーシングによる RTX レンダリング（[グラフィックス第 05 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）、測定したマテリアル、スキャンしたアセット、実在のシーンを 3D ガウシアンスプラッティングで取り込むこと（[ニューラルレンダリング第 06 回]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})）です。**ドメインランダム化**（domain randomization。Tobin et al. 2017、Tremblay et al. 2018）は逆の方向に進みます。テクスチャ、色、ライト、カメラ姿勢、妨害物体、ノイズを非常に広い範囲でランダム化し、現実世界がネットワークにとって「もう 1 つのバリエーション」に見えるようにします。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/05-domain-randomization.svg" caption="小さな NumPy レイキャスタ（スクリプトの `render`）によるドメインランダム化。市松模様の床の上に球と箱があり、ハードシャドウが付いています。左上の枠付きの画像が標準のシーンです。残りの 11 枚は、カメラの周回角・高さ・画角、物体の大きさと位置、すべてのアルベド、市松模様のスケール、光の方向、太陽光と環境光の強さ、色味、露出、ガウスノイズをランダム化しています。このような画像で学習した検出器は、特定の色、光、視点に頼ることができません。" %}

ランダム化そのものは、レンダリングの前にシーンのパラメータをサンプリングするだけです。

```python
import numpy as np

def random_scene(rng):
    return dict(
        camera_yaw=rng.uniform(-0.6, 0.6), camera_height=rng.uniform(1.0, 3.5), fov_deg=rng.uniform(40, 60),
        albedo_object=rng.uniform(0.05, 1.0, 3), checker_scale=rng.uniform(0.5, 4.0),
        light_dir=rng.normal(size=3) * [1, 0, 1] + [0, rng.uniform(0.3, 1.2), 0],   # keep the sun above the floor
        ambient=rng.uniform(0.05, 0.4), exposure=rng.uniform(0.7, 1.3), noise_sigma=rng.uniform(0.0, 0.06))

rng = np.random.default_rng(0)
for i in range(3):
    print({k: np.round(v, 2) for k, v in random_scene(rng).items()})
```

Isaac Sim ではこれが **Replicator** です。ランダマイザを USD の prim（マテリアル、姿勢、ライト、カメラパラメータ）に付けてフレームごとに駆動し、「ライター」が画像とラベルを書き出します。物理の側では、同じ考え方で質量、摩擦、モータゲイン、遅延、外乱をランダム化します。これが**ダイナミクスランダム化**（dynamics randomization）で、歩行の sim-to-real の主要な道具です。強化学習の側は[身体性 AI 第 02 回]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})、プラットフォームは[身体性 AI 第 03 回]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})を参照してください。[次の記事]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})では、生成モデル（Cosmos 型の「世界基盤モデル」）がレンダリングデータを本物らしく見せるため、さらにはレンダラを置き換えるために使われている様子を見ます。

## 試してみよう

- 上の GJK ウィジェットで、原点がちょうど $A\ominus B$ の境界を横切る瞬間を見つけ、EPA の深さを見た目と比べてください。
- [ホームページのラボ]({{ '/' | relative_url }}#lab)の **Cloth · XPBD** タブでは、サブステップ付きの XPBD ソルバが動いています。これは第 5 節の TGS/soft step ソルバの位置レベルの親戚です。
- `stack` 関数を `top_mass=100` にし、10 回の走査をいろいろな配分で使って、積み重ねが沈む様子を見てください。

## 代表的な論文

| 論文 | 掲載先 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Gilbert, Johnson & Keerthi, *A fast procedure for computing the distance between complex objects in three-dimensional space* | IEEE J. Robotics and Automation | 1988 | [DOI](https://doi.org/10.1109/56.2083) | GJK アルゴリズム |
| van den Bergen, *Proximity Queries and Penetration Depth Computation on 3D Game Objects* | GDC | 2001 | — | 貫通深さのための EPA を提案 |
| Catto, *Iterative Dynamics* | GDC | 2005 | [PDF](https://box2d.org/files/ErinCatto_IterativeDynamics_GDC2005.pdf) | 逐次インパルス、累積クランプ、ウォームスタート |
| Featherstone, *Rigid Body Dynamics Algorithms* | Springer（書籍） | 2008 | [DOI](https://doi.org/10.1007/978-1-4899-7560-7) | 空間代数、ABA、CRBA、RNEA |
| Todorov, Erez & Tassa, *MuJoCo: A physics engine for model-based control* | IROS | 2012 | [DOI](https://doi.org/10.1109/IROS.2012.6386109) | 制御のための一般化座標と凸接触 |
| Tobin et al., *Domain Randomization for Transferring Deep Neural Networks from Simulation to the Real World* | IROS | 2017 | [arXiv](https://arxiv.org/abs/1703.06907) | sim-to-real のためのドメインランダム化 |
| Dosovitskiy et al., *CARLA: An Open Urban Driving Simulator* | CoRL | 2017 | [arXiv](https://arxiv.org/abs/1711.03938) | ゲームエンジン上に作られた運転シミュレータ |
| Tremblay et al., *Training Deep Networks with Synthetic Data: Bridging the Reality Gap by Domain Randomization* | CVPR Workshops | 2018 | [arXiv](https://arxiv.org/abs/1804.06516) | 検出のためのランダム化合成データ |
| Juliani et al., *Unity: A General Platform for Intelligent Agents* | arXiv | 2018 | [arXiv](https://arxiv.org/abs/1809.02627) | Unity ML-Agents |
| Macklin et al., *Small Steps in Physics Simulation* | SCA | 2019 | [DOI](https://doi.org/10.1145/3309486.3340247) | 反復よりサブステップ |
| Macklin et al., *Non-Smooth Newton Methods for Deformable Multi-Body Dynamics* | ACM TOG | 2019 | [arXiv](https://arxiv.org/abs/1907.04587) | 接触・摩擦・変形体のためのニュートン型ソルバ |
| Müller et al., *Detailed Rigid Body Simulation with Extended Position Based Dynamics* | Computer Graphics Forum | 2020 | [DOI](https://doi.org/10.1111/cgf.14105) | 剛体と関節のための XPBD |
| Puig et al., *Habitat 3.0: A Co-Habitat for Humans, Avatars and Robots* | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.13724) | ヒューマノイドとヒューマン・イン・ザ・ループ |
| Tao et al., *ManiSkill3: GPU Parallelized Robotics Simulation and Rendering for Generalizable Embodied AI* | RSS（デモトラック） | 2025 | [arXiv](https://arxiv.org/abs/2410.00425) | GPU 並列のシミュレーションとレンダリング |
| Zakka et al., *MuJoCo Playground* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2502.08844) | sim-to-real 付きの MJX 環境 |
| Mittal et al., *Isaac Lab: A GPU-Accelerated Simulation Framework for Multi-Modal Robot Learning* | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2511.04831) | Isaac Lab の設計 |

## 学習リソース

- Erin Catto の [Box2D の発表資料](https://box2d.org/publications/)（拘束、GJK、連続衝突についての GDC 講演）と、8 種のソルバを比較したブログ記事 [Solver2D](https://box2d.org/posts/2024/02/solver2d/)。
- Christer Ericson, *Real-Time Collision Detection*（Morgan Kaufmann, 2004）：ブロードフェーズ、SAT、GJK、BVH。定番の教科書です。
- Gino van den Bergen, *Collision Detection in Interactive 3D Environments*（Morgan Kaufmann, 2003）。
- Ian Millington, *Game Physics Engine Development*（第 2 版, 2010）：エンジンを丸ごと作ります。
- Roy Featherstone の書籍（上の表）と、MuJoCo ドキュメントの *Computation* の章（一般化座標と接触）。
- 読む価値のあるコード：[Box2D v3](https://github.com/erincatto/box2d)（コンパクトな C）、[Jolt Physics](https://github.com/jrouwe/JoltPhysics)、[PhysX](https://github.com/NVIDIA-Omniverse/PhysX) とその[剛体ドキュメント](https://nvidia-omniverse.github.io/PhysX/physx/5.6.0/docs/RigidBodyDynamics.html)（PGS と TGS）、[Rapier](https://github.com/dimforge/rapier)、[MuJoCo](https://github.com/google-deepmind/mujoco)、[Newton](https://github.com/newton-physics/newton)、[Genesis](https://github.com/Genesis-Embodied-AI/Genesis)、[Isaac Lab](https://github.com/isaac-sim/IsaacLab)。
- [OpenUSD のドキュメント](https://openusd.org/release/index.html)、特に用語集のコンポジションアークの項目と、[UsdPhysics](https://openusd.org/release/api/usd_physics_page_front.html) スキーマの概要。

## 演習

1. `sweep_and_prune` に 2 本目の軸を加えてください。$x$ で走査し、$y$ でフィルタします。すべての箱が水平線上に並ぶ場合の候補数を比べてください。どの軸で走査すべきでしょうか。エンジンはそれをどう自動で選べるでしょうか（ヒント：箱の中心の分散）。
2. 円のサポート関数を書いて 2D GJK を円に拡張し、円と多角形をテストしてください。なぜ `gjk` の他の部分は何も変える必要がないのでしょうか。
3. `gjk` に「最近点」モードを加えてください。形状が離れているとき、原点から最後の単体までの距離を返します。軸平行な 2 つの正方形で、本当の距離と一致することを確かめてください。
4. `stack` の Baumgarte バイアスを第 5 節のソフト拘束の係数に置き換え（$f$ = 30 Hz、$\zeta = 1$）、PGS 版と貫通や振動を比べてください。
5. アセットファイルを編集せずに、`/World/Props` 以下のすべてのコライダの摩擦を上書きする USD レイヤーを書いてください。どのコンポジションの機能がそれを可能にしているでしょうか。

<details markdown="1"><summary>ヒント</summary>

1. AABB の中心の分散が最大の軸で走査します。水平線は $y$ 方向の分散がほぼ 0 なので、$x$ で走査します。2. GJK は `support` を通してしか形状に触れません。円のサポート点は $\mathbf{c} + r\,\mathbf{d}/\lVert\mathbf{d}\rVert$ です。3. 現在の単体上の最近点を追跡し、$\mathbf{p}\cdot\mathbf{d}$ による距離の改善が $\varepsilon$ を超えなくなったら止めます。4. 貫通している接触に $\lambda = -m_{\text{eff}}\,\tfrac{a}{1+a}(\mathbf{J}\mathbf{u} + \tfrac{\omega}{2\zeta+h\omega}C)$ を使います。5. `over` prim（またはプロップが継承するクラス prim）を持つ強いレイヤーが、新しい `physics:dynamicFriction` のオピニオンを運びます。LIVRPS によりローカルのオピニオンが勝ちます。

</details>

[次の記事]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})でシリーズを締めくくります。エンジンの中のニューラルネットワーク、生成コンテンツ、エディタの中の LLM エージェント、そして本記事のパイプライン全体を学習した世界モデルで置き換えるニューラル「ゲームエンジン」です。
