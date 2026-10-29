// Latent rollout explorer (world-models post 01).
// A small MLP dynamics model, trained in bin/figures/world-models/world_models_01.py on 300 random
// pendulum transitions, is rolled out open-loop next to the true pendulum. Drag the start state on
// the phase plane, change the horizon and the constant torque, and watch the error grow with k.
(function () {
  "use strict";
  // BEGIN WEIGHTS (written by world_models_01.py)
  var MODEL = {"dt":0.05,"g":9.81,"damp":0.1,"W":[[[-0.3315,0.3308,-0.1074,-0.2509],[-0.4077,0.2469,0.0367,0.1687],[-0.1337,0.1762,-0.1363,-0.049],[-0.6873,-0.2979,-0.1902,0.1095],[0.3548,0.4463,-0.1904,0.0349],[0.0749,0.5199,-0.0761,0.0941],[-0.1884,-0.027,0.2619,-0.2358],[-0.403,-0.133,-0.1475,0.2439],[-0.4887,-0.2636,-0.2599,-0.1917],[-0.2672,0.5462,0.1918,0.106],[0.0849,-0.424,0.1002,-0.1515],[-0.5143,-0.1014,0.233,0.1722],[-0.1786,0.0338,0.2366,0.137],[0.5241,-0.016,0.2124,-0.0736],[-0.0345,-0.3565,-0.2636,-0.029],[0.2918,0.1655,-0.2138,0.1316],[0.3302,-0.169,0.0302,0.2128],[0.2188,0.5102,-0.1379,-0.1513],[0.3742,0.4568,0.4255,0.1328],[0.2198,-0.516,0.0781,-0.0623],[-0.513,0.484,0.1917,-0.2938],[-0.0468,-0.0238,-0.1581,-0.0673],[0.0667,-0.3765,0.1856,0.2187],[0.3252,0.2536,-0.2888,-0.1616],[0.4153,0.0701,-0.2295,-0.0915],[0.4845,0.4121,-0.1759,-0.0613],[-0.6111,0.0913,-0.2956,-0.1065],[0.0694,0.0406,-0.232,0.108],[-0.514,0.4841,0.1992,-0.1848],[-0.1832,-0.0377,0.1743,0.1019],[0.2745,0.0544,-0.1734,0.1428],[-0.5428,-0.2972,-0.0636,-0.2677]],[-0.1567,-0.3962,-0.1355,0.2201,-0.1444,0.0158,0.4082,0.007,-0.0049,-0.004,0.0156,0.3164,0.4383,0.2596,0.594,-0.0218,-0.301,-0.1582,0.493,-0.0123,-0.3272,-0.3889,-0.5653,-0.3941,-0.1155,0.3338,0.4112,-0.5659,0.4501,-0.4031,-0.1107,-0.1539],[[-0.0784,-0.0709,-0.2156,-0.0486,-0.0547,-0.0588,-0.089,0.0447,-0.187,-0.0475,0.2069,-0.0474,0.1562,0.1133,-0.182,0.0871,-0.0184,-0.1063,0.1399,-0.077,-0.0242,-0.0575,0.1897,0.0778,0.0671,-0.0042,-0.0751,-0.084,-0.2103,0.1494,0.1138,0.1839],[-0.1546,0.0206,-0.1685,-0.1606,-0.1353,-0.0411,-0.094,-0.0532,-0.0154,0.1622,-0.0489,-0.0923,-0.0959,0.1491,-0.1327,0.1091,0.0593,-0.0031,0.0073,0.0675,0.0678,-0.0546,0.0804,0.0159,-0.1659,-0.2034,0.0771,-0.1698,0.0228,0.2325,0.0235,-0.0246],[-0.0981,0.0862,-0.0545,0.0226,0.0035,0.027,-0.0624,0.2154,0.0843,0.0763,0.0217,-0.1839,0.0151,-0.1831,0.0035,0.1326,0.0903,0.191,-0.118,0.0425,0.0206,-0.1094,0.1303,-0.0824,0.0736,0.0761,-0.0206,0.0867,0.074,-0.0942,-0.0261,-0.0139],[-0.2059,0.2132,-0.1404,-0.1002,-0.1333,0.0388,0.058,0.1164,0.032,-0.0574,-0.0023,0.1008,0.085,0.027,-0.2116,-0.16,-0.0586,0.0035,-0.1575,-0.0988,0.2057,-0.0198,0.1031,0.0777,-0.072,-0.2384,-0.2577,0.2212,-0.0095,0.4097,-0.1429,0.1257],[-0.0934,-0.0038,-0.1735,0.0413,0.016,-0.0637,-0.0008,-0.1488,0.0659,-0.0254,0.1255,-0.0101,-0.0367,0.0883,-0.1665,0.0012,0.0679,-0.1665,0.0975,0.1452,0.1269,-0.1092,-0.082,-0.0482,0.015,-0.1181,0.0262,0.0561,-0.0654,0.0599,0.0254,-0.0618],[0.0617,0.0148,-0.0876,-0.1053,0.1555,0.2632,0.1471,-0.0869,0.0542,-0.0276,-0.2203,-0.1953,0.1747,0.1533,-0.2021,0.0655,0.0913,0.2453,0.1801,0.0449,0.0339,-0.0695,0.0395,0.0821,-0.0857,0.3013,0.0165,0.0595,-0.0377,0.0023,-0.1144,0.0754],[-0.0338,0.051,0.0466,0.1703,-0.0528,0.0274,-0.1289,0.1192,-0.1066,-0.211,-0.1789,0.1527,0.1101,0.1389,0.216,-0.1298,-0.1259,-0.0436,-0.1212,0.1665,-0.185,-0.0906,-0.1467,-0.1068,0.1384,0.0416,0.2195,0.1511,0.1253,-0.0783,0.1131,0.1986],[0.0398,0.4242,0.0397,0.1542,-0.1027,0.0281,-0.0121,-0.0332,-0.1038,-0.0216,-0.1065,0.2096,0.1248,-0.065,-0.2352,0.0557,0.1589,-0.017,-0.1109,0.2021,0.171,-0.1133,0.2786,0.1632,-0.1632,-0.0315,-0.1726,0.0002,0.168,0.2416,-0.2057,-0.0004],[-0.0743,-0.1263,-0.0349,0.2726,-0.0179,-0.2346,-0.0185,0.1588,0.1349,-0.2474,0.1005,-0.1327,-0.1097,0.0418,-0.047,0.0445,0.16,-0.0523,-0.1669,0.0587,-0.0215,-0.1193,0.1708,-0.1196,-0.1478,-0.3083,0.0335,0.1284,-0.2409,0.1086,-0.0362,0.119],[-0.0225,-0.1604,0.1097,-0.0039,0.1324,0.1758,-0.0499,0.058,-0.0486,0.1555,-0.1798,0.0032,-0.1162,-0.0109,-0.0382,-0.2233,0.0137,0.0775,0.0797,-0.204,-0.0663,-0.1021,-0.0192,0.1034,0.0393,0.0962,-0.019,-0.2347,-0.075,0.0812,-0.1807,0.0221],[-0.1012,-0.118,-0.1253,0.1495,-0.0034,0.0269,0.0917,0.1371,0.0361,-0.1176,-0.0144,0.0023,0.0573,-0.1476,0.1913,-0.0078,-0.1286,-0.0936,0.1113,0.282,-0.1983,0.1549,0.0972,0.1228,0.1709,-0.1578,0.0987,0.1028,-0.1015,0.0469,-0.0248,0.1657],[-0.122,-0.1935,-0.0373,0.1883,-0.1212,-0.068,0.0965,-0.0354,0.0098,-0.163,0.147,-0.1115,-0.1028,-0.001,0.1763,-0.0654,0.103,-0.1282,0.2399,0.2789,-0.2746,-0.1411,-0.0418,0.0132,-0.055,-0.1761,-0.112,-0.001,-0.2852,0.0742,-0.0396,-0.0641],[-0.0033,0.1316,-0.1566,-0.0816,-0.1095,0.2641,-0.1076,-0.2497,0.125,-0.0428,0.057,0.0332,0.0095,0.0115,0.0333,-0.0664,-0.2209,-0.1293,-0.0146,0.0016,-0.0418,0.1235,-0.1259,-0.0898,0.0834,0.1916,0.0781,0.0454,0.0175,-0.1286,-0.0861,0.0911],[0.0052,-0.1269,0.1483,0.1955,0.0105,-0.0588,-0.215,0.0764,0.0295,-0.1687,-0.0363,-0.0056,0.0546,0.0824,-0.0201,-0.1122,-0.1096,0.2206,-0.0121,-0.0003,-0.1686,0.2785,0.154,0.2182,-0.0946,-0.0185,-0.1052,0.2685,-0.1463,-0.0666,0.1488,-0.011],[-0.1316,-0.0539,-0.0741,-0.1382,0.1203,-0.1228,0.0957,0.1229,0.0538,0.0763,0.1966,0.0601,-0.0391,0.2204,0.0149,-0.1921,-0.0187,-0.141,0.2238,0.0324,-0.1508,-0.1183,0.1408,0.0364,0.0295,0.0056,0.0441,-0.1379,-0.0705,-0.1673,-0.1638,-0.0302],[-0.1329,0.0464,0.0169,-0.0381,-0.1575,0.0424,-0.0776,0.1004,-0.1622,0.0078,0.1884,-0.034,0.1634,-0.0964,-0.2162,-0.1332,0.0083,0.1276,-0.0726,0.0691,0.0109,-0.0536,0.1717,-0.1605,-0.021,0.0056,-0.0771,0.1065,-0.011,0.2013,-0.2214,-0.0463],[-0.0094,0.0496,0.0956,0.2324,0.0128,-0.0961,0.0616,0.038,0.196,-0.1869,-0.0308,-0.0534,0.0297,0.073,0.0339,-0.0879,0.1376,0.0735,0.0226,0.001,0.0524,0.2059,0.1472,-0.1066,0.1698,-0.2969,0.099,0.0873,-0.1615,0.0598,-0.0894,0.0905],[-0.1164,-0.1076,0.0088,0.25,-0.089,-0.0345,-0.0436,-0.0203,-0.1114,-0.258,0.2835,-0.0604,-0.0216,0.0308,0.216,0.1654,0.1559,-0.1656,-0.0699,0.0312,-0.1794,0.0615,0.229,-0.116,0.1343,-0.235,0.0315,0.1562,-0.1124,-0.0429,-0.0826,0.2162],[-0.0681,-0.1343,-0.0008,-0.1698,-0.1678,-0.0284,0.1692,-0.0883,0.0469,0.2363,0.1546,-0.0548,0.0265,-0.0133,-0.1638,-0.0203,0.1396,0.1252,0.0798,0.0872,-0.0749,0.0519,-0.0434,-0.1413,-0.0013,0.0878,-0.1923,0.0856,0.1204,-0.1171,-0.0705,0.0586],[-0.0887,0.0471,0.1289,-0.0986,0.1487,0.1013,0.0267,-0.0337,0.2208,-0.1679,0.0348,-0.2242,-0.2347,0.0253,0.0233,0.0678,-0.0074,-0.0449,-0.1452,-0.1482,-0.0241,0.1294,0.1498,0.1167,0.2151,-0.1248,-0.0557,0.0486,-0.1984,-0.0473,0.0498,0.0305],[0.0313,0.0633,0.0777,0.0127,-0.0623,0.095,0.2092,-0.0658,-0.0023,0.0719,-0.0421,0.0335,0.1206,-0.1136,-0.0741,0.0052,-0.0566,0.0938,-0.0214,0.1277,0.2285,-0.0867,0.1701,-0.0833,-0.1163,-0.1341,-0.0373,-0.1279,0.0492,0.1576,0.0208,0.0419],[-0.0419,-0.0739,-0.2228,0.2543,-0.0291,-0.1428,-0.0618,0.1693,0.0173,0.0845,0.0628,0.1455,0.1155,-0.0293,0.1834,0.0913,0.0214,-0.0151,0.0282,0.194,-0.1277,-0.1242,0.136,-0.1664,-0.0673,-0.1607,0.1717,-0.2158,0.0427,0.1994,0.0102,0.0372],[0.1489,-0.008,-0.0518,-0.1486,-0.0545,-0.0734,0.0146,-0.0729,-0.1879,0.0207,0.0801,0.0392,0.1006,0.1826,-0.2226,-0.0571,-0.0098,-0.1947,-0.1653,0.3423,0.1629,0.1352,0.2967,-0.1352,0.001,-0.0343,-0.19,0.1767,0.0253,0.2758,-0.1012,0.0764],[-0.1183,-0.0284,0.1051,0.0835,0.2029,0.2794,0.1399,0.1393,0.1353,-0.0561,-0.2423,-0.1115,-0.0348,-0.1089,0.1466,0.1133,0.0375,0.0973,0.1594,0.0557,-0.1969,-0.1097,0.0091,0.0525,0.1257,0.0663,-0.1079,0.1317,0.0849,-0.2177,0.1088,-0.1176],[0.1817,0.181,0.2335,-0.202,-0.1415,0.1722,0.1302,0.1433,0.1492,-0.0992,0.0699,-0.1987,0.0014,-0.1758,-0.0682,0.0451,-0.0805,-0.0062,-0.2276,-0.2405,0.0841,0.0471,-0.1307,-0.0628,-0.1276,-0.1422,0.1248,0.1757,0.0575,-0.0253,0.0819,0.0634],[-0.1744,-0.0314,0.1036,-0.2155,-0.2213,-0.0958,0.132,-0.1362,0.0439,0.091,0.2993,0.0363,0.1619,0.1397,-0.1089,0.0006,0.1055,0.1037,-0.1848,0.1844,-0.0711,-0.1786,0.0665,-0.1047,0.0311,-0.1179,-0.1913,-0.0383,-0.0765,0.0873,0.0078,0.1101],[-0.0147,-0.0351,0.0585,-0.0695,-0.0069,-0.1408,0.0097,-0.0897,-0.0462,-0.1007,0.1128,-0.1207,-0.029,0.1379,-0.1928,-0.1578,-0.0158,-0.0864,0.0441,0.0654,0.1197,-0.1412,0.0728,0.0867,0.1291,-0.1215,-0.1901,0.0299,0.1169,-0.0453,-0.1388,0.0328],[0.0396,-0.1347,-0.0337,0.1105,-0.0131,0.1832,0.0852,0.0837,0.0375,-0.1548,-0.0722,-0.0239,-0.1946,-0.1043,-0.0935,0.1562,-0.093,0.2003,-0.1178,-0.1739,0.0275,0.1172,0.0816,0.1106,-0.1196,0.1519,0.004,0.0037,0.051,0.1146,-0.096,0.0544],[0.1836,0.0296,0.1946,-0.012,-0.0492,0.1256,0.0384,0.2095,-0.0412,-0.1789,-0.0444,-0.22,0.0278,0.1007,0.0993,0.0351,0.1141,-0.073,0.1347,-0.121,-0.2184,-0.0,0.1452,0.0569,0.1172,-0.0758,0.1148,0.0206,0.0164,0.0785,0.1316,0.0232],[0.0135,-0.1449,-0.0316,0.1682,-0.049,0.1161,-0.0949,0.0042,0.0356,-0.239,-0.0176,-0.0525,-0.0395,-0.0631,0.2023,0.1641,-0.093,0.0948,-0.1715,-0.0531,-0.0043,0.0328,-0.1114,-0.1581,-0.0341,0.1188,-0.1197,-0.1356,-0.0359,-0.1653,-0.112,-0.0259],[0.0198,-0.17,-0.0553,0.0803,-0.1081,0.0034,-0.168,-0.0573,0.1196,-0.2106,-0.2242,0.0361,-0.0213,0.1108,0.0237,-0.0127,0.0147,0.0522,0.0847,-0.1297,-0.0784,0.1331,-0.0992,-0.0352,0.1478,-0.0643,0.1043,-0.0777,0.0208,-0.202,0.1812,-0.1172],[-0.1006,-0.0304,0.1877,-0.1072,-0.0169,0.0984,-0.0735,0.104,-0.1363,-0.1301,-0.0718,0.0715,0.0048,-0.1574,0.0737,0.0521,-0.0209,-0.0478,-0.1067,0.218,-0.1716,-0.0588,0.0024,0.0699,0.11,-0.0226,-0.0037,-0.0472,-0.1004,-0.095,0.2041,-0.1233]],[-0.0611,-0.1461,-0.06,-0.0281,0.2067,-0.1533,0.0145,0.006,0.1196,0.1655,-0.0069,-0.1201,0.144,-0.1385,0.1286,-0.0458,0.0704,0.1952,0.2078,-0.2511,-0.1452,-0.0316,-0.1851,0.1655,-0.1641,-0.1017,-0.0912,-0.1706,0.0626,-0.1658,-0.1878,-0.2076],[[0.1783,0.2062,-0.095,0.1578,0.2329,0.0303,-0.1524,0.1608,-0.1399,0.0312,-0.2317,0.1756,0.0314,-0.2644,0.2494,0.2854,-0.1011,-0.1623,0.1874,-0.2793,0.2175,0.1423,0.2044,-0.2743,-0.2568,0.1639,0.1881,-0.267,-0.2372,-0.2862,-0.1491,-0.2061],[0.1562,-0.009,0.0549,0.1436,0.1511,-0.2072,0.1263,0.0843,0.2337,-0.1618,0.1642,0.2454,-0.1511,0.0665,0.1665,-0.1032,0.157,0.1791,0.0109,0.1839,0.0932,0.2528,-0.0593,0.1006,-0.2365,-0.1609,-0.0484,-0.1088,0.0997,-0.0696,0.0541,0.1353]],[-0.0972,-0.0313]]};
  // END WEIGHTS

  var TXT = {
    en: { title: "drag the start state", horizon: "horizon H", torque: "torque u", truth: "true pendulum",
      model: "learned model", err: "state error vs step k", one: "1-step error", atH: "error at H" },
    zh: { title: "\u62d6\u52a8\u521d\u59cb\u72b6\u6001", horizon: "\u63a8\u6f14\u6b65\u6570 H", torque: "\u529b\u77e9 u",
      truth: "\u771f\u5b9e\u6446", model: "\u5b66\u5230\u7684\u6a21\u578b", err: "\u72b6\u6001\u8bef\u5dee\u968f\u6b65\u6570 k",
      one: "\u5355\u6b65\u8bef\u5dee", atH: "H \u6b65\u8bef\u5dee" },
    ja: { title: "\u521d\u671f\u72b6\u614b\u3092\u30c9\u30e9\u30c3\u30b0", horizon: "\u30db\u30e9\u30a4\u30be\u30f3 H",
      torque: "\u30c8\u30eb\u30af u", truth: "\u771f\u306e\u632f\u308a\u5b50", model: "\u5b66\u7fd2\u30e2\u30c7\u30eb",
      err: "\u30b9\u30c6\u30c3\u30d7 k \u3068\u72b6\u614b\u8aa4\u5dee", one: "1 \u30b9\u30c6\u30c3\u30d7\u8aa4\u5dee",
      atH: "H \u3067\u306e\u8aa4\u5dee" }
  };
  var PI = Math.PI;
  var OM = 8; // omega range shown: [-OM, OM]

  function wrap(a) { a = (a + PI) % (2 * PI); if (a < 0) a += 2 * PI; return a - PI; }

  function trueStep(s, u) {
    var th = s[0], om = s[1], h = MODEL.dt / 10;
    for (var i = 0; i < 10; i++) { om += h * (-MODEL.g * Math.sin(th) - MODEL.damp * om + u); th += h * om; }
    return [th, om];
  }

  function dense(W, b, x, act) {
    var y = new Array(W.length);
    for (var i = 0; i < W.length; i++) {
      var v = b[i], row = W[i];
      for (var j = 0; j < x.length; j++) v += row[j] * x[j];
      y[i] = act ? Math.tanh(v) : v;
    }
    return y;
  }

  function modelStep(s, u) {
    var W = MODEL.W;
    var x = [Math.cos(s[0]), Math.sin(s[0]), s[1] / 4, u / 2];
    var h = dense(W[0], W[1], x, true);
    h = dense(W[2], W[3], h, true);
    var y = dense(W[4], W[5], h, false);
    return [s[0] + MODEL.dt * 4 * y[0], s[1] + MODEL.dt * 10 * y[1]];
  }

  function stateErr(a, b) {
    var d0 = wrap(a[0] - b[0]), d1 = (a[1] - b[1]) / 4;
    return Math.sqrt(d0 * d0 + d1 * d1);
  }

  function makeSlider(parent, label, min, max, step, value) {
    var wrapEl = document.createElement("label");
    wrapEl.style.cssText = "display:flex;align-items:center;gap:6px;font-size:14px;flex:1 1 200px;min-width:0";
    var span = document.createElement("span");
    span.style.cssText = "white-space:nowrap;min-width:92px";
    var input = document.createElement("input");
    input.type = "range"; input.min = min; input.max = max; input.step = step; input.value = value;
    input.style.cssText = "flex:1;min-width:60px";
    wrapEl.appendChild(span); wrapEl.appendChild(input); parent.appendChild(wrapEl);
    return { input: input, span: span, label: label };
  }

  function init(el) {
    if (!MODEL) { el.textContent = "model weights missing"; return; }
    var T = TXT[el.dataset.lang] || TXT.en;
    el.innerHTML = "";
    el.style.background = "#fff";
    el.style.color = "#222";
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;touch-action:none;cursor:crosshair";
    el.appendChild(canvas);
    var ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 18px;padding:8px 12px 10px;font-family:sans-serif";
    el.appendChild(ctrl);
    var sH = makeSlider(ctrl, T.horizon, 5, 200, 1, 80);
    var sU = makeSlider(ctrl, T.torque, -2, 2, 0.1, 0);
    var state = { s0: [2.2, 0.0], drag: false };
    var ctx = canvas.getContext("2d");
    var layout = null;

    function computeLayout() {
      var w = el.clientWidth || 600;
      var narrow = w < 620;
      var pad = 12;
      var phaseW = narrow ? w - 2 * pad : Math.floor(w * 0.52);
      var phaseH = narrow ? Math.min(300, Math.floor(phaseW * 0.75)) : 300;
      var errW = narrow ? w - 2 * pad : w - phaseW - 3 * pad;
      var errH = narrow ? 170 : phaseH;
      var h = narrow ? phaseH + errH + 3 * pad + 34 : phaseH + 2 * pad + 34;
      layout = {
        w: w, h: h,
        phase: { x: pad + 40, y: pad + 30, w: phaseW - 48, h: phaseH - 60 },
        err: narrow ? { x: pad + 52, y: phaseH + 2 * pad + 34, w: errW - 62, h: errH - 40 }
                    : { x: phaseW + 2 * pad + 52, y: pad + 30, w: errW - 64, h: phaseH - 60 }
      };
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function px(th, om) {
      var P = layout.phase;
      return [P.x + (th + PI) / (2 * PI) * P.w, P.y + (OM - om) / (2 * OM) * P.h];
    }

    function drawPath(path, color, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.setLineDash(dash || []);
      ctx.beginPath();
      var prev = null;
      for (var i = 0; i < path.length; i++) {
        var th = wrap(path[i][0]), om = Math.max(-OM, Math.min(OM, path[i][1]));
        var p = px(th, om);
        if (prev === null || Math.abs(th - prev) > PI) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        prev = th;
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    function draw() {
      var H = parseInt(sH.input.value, 10), u = parseFloat(sU.input.value);
      sH.span.textContent = sH.label + " = " + H;
      sU.span.textContent = sU.label + " = " + u.toFixed(1);
      var tr = [state.s0.slice()], md = [state.s0.slice()], err = [0];
      for (var k = 0; k < H; k++) {
        tr.push(trueStep(tr[k], u)); md.push(modelStep(md[k], u));
        err.push(stateErr(tr[k + 1], md[k + 1]));
      }
      var L = layout, P = L.phase, E = L.err;
      ctx.clearRect(0, 0, L.w, L.h);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, L.w, L.h);
      ctx.font = "13px sans-serif"; ctx.fillStyle = "#222";
      // phase-plane frame and grid
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1;
      [-PI, -PI / 2, 0, PI / 2, PI].forEach(function (t) { var a = px(t, OM), b = px(t, -OM); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      [-OM, -4, 0, 4, OM].forEach(function (o) { var a = px(-PI, o), b = px(PI, o); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
      ctx.strokeStyle = "#888"; ctx.strokeRect(P.x, P.y, P.w, P.h);
      ctx.textAlign = "center";
      ["-\u03c0", "0", "\u03c0"].forEach(function (s, i) { var p = px(-PI + i * PI, -OM); ctx.fillText(s, p[0], p[1] + 16); });
      ctx.fillText("\u03b8", P.x + P.w / 2, P.y + P.h + 30);
      ctx.textAlign = "right";
      [-OM, 0, OM].forEach(function (o) { var p = px(-PI, o); ctx.fillText(String(o), p[0] - 5, p[1] + 4); });
      ctx.textAlign = "center"; ctx.fillText("\u03c9", P.x - 30, P.y + P.h / 2 + 4);
      ctx.textAlign = "left"; ctx.fillStyle = "#555"; ctx.fillText(T.title, P.x, P.y - 10);
      // trajectories
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
      drawPath(tr, "#222");
      drawPath(md, "#9467bd", [7, 5]);
      var a = px(wrap(tr[H][0]), tr[H][1]), b = px(wrap(md[H][0]), md[H][1]);
      ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(a[0], a[1], 4.5, 0, 2 * PI); ctx.fill();
      ctx.fillStyle = "#9467bd"; ctx.beginPath(); ctx.arc(b[0], b[1], 4.5, 0, 2 * PI); ctx.fill();
      ctx.restore();
      var s = px(state.s0[0], state.s0[1]);
      ctx.fillStyle = "#ff7f0e"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s[0], s[1], 8, 0, 2 * PI); ctx.fill(); ctx.stroke();
      // legend
      ctx.lineWidth = 2.4; ctx.font = "13px sans-serif";
      var lx = P.x + P.w - 150, ly = P.y + 14;
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(lx - 6, ly - 12, 154, 40);
      ctx.strokeStyle = "#222"; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 26, ly); ctx.stroke();
      ctx.strokeStyle = "#9467bd"; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(lx, ly + 18); ctx.lineTo(lx + 26, ly + 18); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#222"; ctx.textAlign = "left";
      ctx.fillText(T.truth, lx + 32, ly + 4); ctx.fillText(T.model, lx + 32, ly + 22);
      // error plot (linear axes)
      var emax = 0;
      for (var i = 0; i < err.length; i++) emax = Math.max(emax, err[i]);
      emax = Math.max(emax * 1.1, 0.01);
      ctx.strokeStyle = "#888"; ctx.lineWidth = 1; ctx.strokeRect(E.x, E.y, E.w, E.h);
      ctx.fillStyle = "#555"; ctx.fillText(T.err, E.x, E.y - 10);
      ctx.fillStyle = "#222"; ctx.textAlign = "center";
      ctx.fillText("0", E.x, E.y + E.h + 16); ctx.fillText(String(H), E.x + E.w, E.y + E.h + 16);
      ctx.fillText("k", E.x + E.w / 2, E.y + E.h + 16);
      ctx.textAlign = "right";
      ctx.fillText(emax.toPrecision(2), E.x - 5, E.y + 10); ctx.fillText("0", E.x - 5, E.y + E.h);
      ctx.strokeStyle = "#9467bd"; ctx.lineWidth = 2.4; ctx.beginPath();
      for (i = 0; i < err.length; i++) {
        var x = E.x + i / H * E.w, y = E.y + E.h - err[i] / emax * E.h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // straight line through the one-step error: k * eps_1
      ctx.strokeStyle = "#999"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(E.x, E.y + E.h);
      var kEnd = Math.min(H, emax / Math.max(err[1], 1e-9));
      ctx.lineTo(E.x + kEnd / H * E.w, E.y + E.h - Math.min(err[1] * kEnd, emax) / emax * E.h);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = "left"; ctx.fillStyle = "#222";
      ctx.fillText(T.one + " = " + err[1].toExponential(1) + ",  " + T.atH + " = " + err[H].toFixed(3), E.x + 6, E.y + 18);
    }

    function pick(ev) {
      var r = canvas.getBoundingClientRect(), P = layout.phase;
      var x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (x < P.x - 10 || x > P.x + P.w + 10 || y < P.y - 10 || y > P.y + P.h + 10) return false;
      var th = (x - P.x) / P.w * 2 * PI - PI, om = OM - (y - P.y) / P.h * 2 * OM;
      state.s0 = [Math.max(-PI, Math.min(PI, th)), Math.max(-OM, Math.min(OM, om))];
      return true;
    }
    canvas.addEventListener("pointerdown", function (ev) {
      if (pick(ev)) { state.drag = true; canvas.setPointerCapture(ev.pointerId); draw(); ev.preventDefault(); }
    });
    canvas.addEventListener("pointermove", function (ev) { if (state.drag && pick(ev)) draw(); });
    canvas.addEventListener("pointerup", function () { state.drag = false; });
    canvas.addEventListener("pointercancel", function () { state.drag = false; });
    sH.input.addEventListener("input", draw);
    sU.input.addEventListener("input", draw);
    var lastW = -1;
    function resize() { var w = el.clientWidth; if (w === lastW) return; lastW = w; computeLayout(); draw(); }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
  }

  function boot() {
    var els = document.querySelectorAll('[data-widget="world-models-latent-rollout"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
