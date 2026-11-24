# Part E: Adoption barriers and market data

Compiled 2026-11-24 for the column "3D GUI agents". How entries were checked:

- **Papers.** Title, authors, venue and date were checked against the OpenAlex record for the DOI (or the arXiv abs page). Abstracts were read for every paper. Full texts were read for E01 (open-access PDF from the authors' repository), E02 (arXiv HTML), E03 (PubMed Central) and E09 (PubMed Central). For E04 and E06 only the abstract was available (the publisher returned HTTP 403), so their notes stay at abstract level.
- **Market data.** Numbers come from text that was actually read: IDC press releases on idc.com, the Counterpoint and Omdia pages, Meta's Q4 2025 press release and Q3 2026 10-Q on sec.gov, and Apple, Meta and Samsung announcement pages. Where only a press article quoting an analyst could be read, the entry says so and the number is labelled "press report".
- **Survey data.** The two Variety VIP+ survey numbers were read from the Datawrapper CSV files behind the published charts.
- **Arithmetic.** Where we derived a number ourselves (for example, a unit total from a growth rate), it is marked "derived".

## 1. Works and sources

| ID | Title | First author et al. / organization | Venue / status / type | Year | Link | Contribution (one line) | Relevance to 3D GUI agents (one line) |
|---|---|---|---|---|---|---|---|
| E01 | A holistic analysis towards understanding consumer perceptions of virtual reality devices in the post-adoption phase | Milad Dehghani (Armani Dehghani), Fulya Açikgöz, Atefeh Mashatan, Seung Hwan Lee | Behaviour & Information Technology 41(7):1453–1471 (peer-reviewed) | 2021 (online), 2022 (issue) | https://doi.org/10.1080/0144929X.2021.1876767 | Coded 3,205 Amazon verified-purchase reviews of 10 VR products, then ran an SEM survey of 119 users. Discomfort and health risk lower continuance. "Effort expectancy" was a minor review theme. | The largest review-based study of why owners keep or stop using VR. Usability shows up, but it is small next to discomfort. |
| E02 | Wearable AR in Everyday Contexts: Insights from a Digital Ethnography of YouTube Videos | Tram Thi Minh Tran, Shane Brown, Oliver Weidlich, Soojeong Yoo, Callum Parker | ACM CHI 2025 (peer-reviewed) | 2025 | https://doi.org/10.1145/3706598.3713572 (arXiv: https://arxiv.org/abs/2502.06191) | Analysed 112 videos (about 27 h) of sustained use of Vision Pro, Quest 3, Ray-Ban Meta, XREAL and Viture. Use is mostly media and games. Productivity is limited by hardware and apps. | Lists concrete interaction pain points (no precise input, hand tracking failing in the dark, hidden modes) that an assisting agent could address. |
| E03 | Psychological predictors of consumer-level virtual reality technology adoption and usage | James J. Cummings, Tiernan J. Cahill, Blake Wertz, Qiankun Zhong | Virtual Reality 27(2):1357–1379 (peer-reviewed) | 2022 (online), 2023 (issue) | https://doi.org/10.1007/s10055-022-00736-1 (PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC9800239/) | Two-wave US panel survey (1,005 valid cases: 737 owners, 268 non-owners). Traits such as immersive tendencies and absorption predict adoption timing and usage better than demographics. | Shows that who keeps using VR depends on user traits. Ease of use was not measured, so the paper is silent on complexity. |
| E04 | Adoption of Virtual Reality Headsets: The Role of Metaverse Trials for Consumers' Usage and Purchase Intentions | Thorsten Hennig-Thurau, Alina Marie Herting, David Jütte | Journal of Interactive Marketing 60(2):145–160 (peer-reviewed) | 2024 (online), 2025 (issue) | https://doi.org/10.1177/10949968241263353 | Almost 100 participants in an extensive metaverse trial plus matched non-trialists. After the trial, intention to use headsets was higher and intention to buy them was lower. | Trying a headset does not convert to purchase. That points to value and price rather than first-contact difficulty (abstract-level evidence only). |
| E05 | Affordance, usefulness, enjoyment, and aesthetics in sustaining virtual reality engagement | Hyeon Jo, Do-Hyung Park | Scientific Reports 13:15097 (peer-reviewed) | 2023 | https://doi.org/10.1038/s41598-023-42113-1 | PLS-SEM model of VR users' continuance intention. Functional, cognitive and physical affordances feed usefulness and enjoyment, which drive continuance. | "Cognitive affordance" (how easily users grasp what to do) is one route to continued use. This is the construct an agent would act on. |
| E06 | The User Affordances of Apple Vision Pro: Insights from Early Adopters | Wondwesen Tafesse | SAGE Open 16(3) (peer-reviewed, open access) | 2026 | https://doi.org/10.1177/21582440261464433 | Content analysis of early adopters' YouTube reviews. Seven affordances, including "intuitive user interface", mapped onto Rogers' innovation attributes (including complexity). | Early adopters rate the Vision Pro interface as intuitive. This is evidence against "the UI is too complex" for that group (abstract-level evidence only). |
| E07 | Augmented reality smart glasses: an investigation of technology acceptance drivers | Philipp A. Rauschnabel, Young Kyun Ro | International Journal of Technology Marketing 11(2):123 (peer-reviewed) | 2016 | https://doi.org/10.1504/IJTMKT.2016.075690 | A pre-market acceptance model for AR smart glasses. Drivers are functional benefits, ease of use, individual differences, brand attitude and social norms. Privacy and self-presentation mattered less. | Ease of use is a named adoption driver for glasses, measured before people could use the devices. |
| E08 | Fostering consumer acceptance of smart glasses: the moderating role of price sensitivity | Anita Ciunova-Shuleska et al. | Technology Analysis & Strategic Management 37(12):2771–2784 (peer-reviewed) | 2024 (online), 2025 (issue) | https://doi.org/10.1080/09537325.2024.2372780 | Value-attitude-behaviour model using Amazon Echo Frames. Wearable comfort, fashionability and lifestyle compatibility drive perceived value. Price sensitivity weakens the value-to-attitude link. | For glasses, comfort, looks and price dominate. Interface ease is not among the named drivers. |
| E09 | Exploring social perceptions of everyday smartglass use in Australia | Fareed Kaviani, Ben Lyall, Sjaan Koppel | PLOS ONE 19(11):e0313001 (peer-reviewed) | 2024 | https://doi.org/10.1371/journal.pone.0313001 | Survey of 1,037 Australians (608 Ray-Ban Stories owners, 429 non-owners). Non-owners see more privacy issues and expect others to be more offended. | Social acceptability is a barrier for camera glasses that is independent of UI complexity. |
| E10 | Factors Associated With Virtual Reality Sickness in Head-Mounted Displays: A Systematic Review and Meta-Analysis | Dimitrios Saredakis et al. | Frontiers in Human Neuroscience 14:96 (peer-reviewed) | 2020 | https://doi.org/10.3389/fnhum.2020.00096 | 55 studies, 3,016 participants. Pooled total SSQ mean 28.00 (95% CI 24.66–31.35), which is "relatively high". Gaming content was highest (34.26). | Sickness is a physiological barrier that UI agents cannot remove, though they can avoid triggering it (locomotion, exposure time). |
| E11 | IDC Worldwide Quarterly AR/VR Headset Tracker press releases and blog (2023-03-08, 2023-12-20, 2024-03-05, 2025-03-25, 2025-12-11, 2026-03-23; blog 2026-06-15) | IDC (Jitesh Ubrani, Ramon T. Llamas) | Analyst press releases (estimates from a tracker) | 2023–2026 | https://www.idc.com/resource-center/press-releases/global-shipments-of-ar-vr-headsets-decline-sharply-in-2022-following-the-prior-years-strong-results-according-to-idc/ ; https://www.idc.com/resource-center/press-releases/ar-vr-headset-market-forecast-to-decline-8-3-in-2023-but-remains-on-track-to-rebound-in-2024-according-to-idc/ ; https://www.idc.com/?p=103563 ; https://www.idc.com/resource-center/press-releases/growth-expected-to-pause-for-ar-vr-headsets-according-to-idc/ ; https://www.idc.com/resource-center/press-releases/global-xr-shipments-rebound-behind-glasses-first-momentum-idc-reports/ ; https://www.idc.com/resource-center/press-releases/xr-market-grew-44-4-in-2025-as-smart-glasses-redefine-the-category/ ; https://www.idc.com/resource-center/blog/smart-glasses-surge-the-xr-market-is-rewriting-its-own-rules/ | Yearly headset shipments 2021–2025, the 2025 shift to glasses, and forecasts for 2026–2030. | The scale of the market, and the fact that growth has moved to devices with little or no UI. |
| E12 | Counterpoint Research: VR headset and AR smart glasses insights (H1 2025, Q4 2025) and "Apple Vision Pro Long-Term Review" | Counterpoint Research (Flora Tang et al.; Ritesh Bendre) | Analyst reports and insight pages | 2025–2026 | https://counterpointresearch.com/en/insights/global-vr-headset-market-in-h1-2025 ; https://counterpointresearch.com/en/reports/Global-AR-VR-Market-Insights-and-Development-Trends-Q4-2025 ; https://counterpointresearch.com/en/insights/apple-vision-pro-long-term-review-reality-check-spatial-computing | VR shipments −14% in H1 2025 and −28% in FY2025. AR smart glasses +108% in FY2025. A 10-user test of Vision Pro names comfort and price as the main barriers, plus "a bit of a learning curve". | A second analyst series that confirms IDC's direction. It also offers a small, non-peer-reviewed note on the learning curve. |
| E13 | Reality check for VR: Omdia forecasts decline as Apple's entry fails to galvanize market | Omdia (George Jijiashvili) | Analyst press release (PR Newswire) | 2024-12-12 | https://prnewswire.com/news-releases/reality-check-for-vr-omdia-forecasts-decline-as-apples-entry-fails-to-galvanize-market-302330338.html | 2024 headset sales of 6.9 M (−10%). Headsets in active use fell 8% to 21.9 M. Content and engagement are named as the problems. | The only usage-base (installed and active) estimate found from a recognised analyst. |
| E14 | Meta: Q4 and full-year 2025 results press release; Form 10-Q for Q3 2026 | Meta Platforms | Company filings and press release | 2026-01-28 ; 2026 (Q3 10-Q) | https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/ ; https://www.sec.gov/Archives/edgar/data/0001326801/000162828026066773/meta-20260930.htm | Reality Labs revenue and operating loss for 2024, 2025 and Q3 2026. | Shows how much the leading vendor spends against how little hardware revenue it earns. |
| E15 | EssilorLuxottica Q4/FY2025 results (AI glasses units), as reported by UploadVR | EssilorLuxottica (company); UploadVR (David Heaney) | Company results release (2026-02-11); press report | 2026 | https://www.essilorluxottica.com/en/newsroom/press-releases/q4-full-year-2025-results ; https://uploadvr.com/meta-essilorluxottica-sold-7-million-smart-glasses-in-2025/ | More than 7 M Ray-Ban Meta and Oakley Meta AI glasses sold in 2025, against 2 M from October 2023 to February 2025. | The best-selling smart wearable in this space has almost no spatial GUI (voice, camera, audio). |
| E16 | Product launch announcements: Apple Vision Pro (2024-01-08), Vision Pro with M5 (2025-10-15), Meta Ray-Ban Display (2025-09-17, updated 2025-09-30), Samsung Galaxy XR (2025-10-22) | Apple; Meta; Samsung | Company announcements | 2024–2025 | https://www.apple.com/newsroom/2024/01/apple-vision-pro-available-in-the-us-on-february-2/ ; https://www.apple.com/newsroom/2025/10/apple-vision-pro-upgraded-with-the-m5-chip-and-dual-knit-band/ ; https://about.fb.com/news/2025/09/meta-ray-ban-display-ai-glasses-emg-wristband/ ; https://www.samsung.com/ae/news/local/introducing-galaxy-xr-opening-new-worlds/ (price: https://www.axios.com/2025/10/22/samsung-galaxy-xr-project-moohan ; https://www.macrumors.com/2025/10/21/samsung-galaxy-xr-headset/) | Prices and dates: Vision Pro $3,499 (Feb 2024 and Oct 2025), Ray-Ban Display $799 with Neural Band, Galaxy XR $1,799. | Price points of the platforms a 3D GUI agent would run on. |
| E17 | Worldwide Smartphone Market Grows 2.3% in Q4 2025 | IDC | Analyst press release (preliminary data) | 2026-01-13 | https://www.idc.com/resource-center/press-releases/q425mobilephonetop5/ | 1,260.3 M smartphones shipped in 2025 and 1,236.3 M in 2024. | The scale comparison for "XR has not become the next phone". |
| E18 | Variety Intelligence Platform (VIP+) surveys: CivicScience "Apple Vision Pro Study" (June 2023, Jan–Feb 2024) and SmithGeiger "VR/MR Entertainment Survey" (Feb 2024) | Variety VIP+ with CivicScience and SmithGeiger Group | Commercial consumer surveys (US, online). Medium quality: methods notes only, no questionnaire published | 2023–2024 | https://datawrapper.dwcdn.net/tcgki/1/ ; https://datawrapper.dwcdn.net/VDWc3/3/ | Reasons for not buying a Vision Pro (price at 65.5% leads) and for not watching video in VR (comfort at 33% leads). | Neither survey offered "too hard to use" as an answer. The nearest item is "not aware of its capabilities" (22.3%). |
| E19 | American teens aren't excited about virtual reality, with only 4% using it daily (Piper Sandler "Taking Stock With Teens", spring 2023) | CNBC (Kif Leswing), reporting Piper Sandler | Press report of a bank's consumer survey | 2023-04-04 | https://www.cnbc.com/2023/04/04/american-teens-not-into-virtual-reality-only-4percent-use-it-daily-.html | 29% of teens own a VR device. 4% of owners use it daily and 14% weekly. 7% plan to buy. | The clearest usage-frequency number from a large sample, though it covers teens only. |
| E20 | Press reports of Vision Pro and Quest volumes and of the FT report on Vision Pro cuts: The Register (2026-01-02), MacTech (2026-01-02) | The Register (O'Ryan Johnson); MacTech (Dennis Sellers), relaying IDC, the Financial Times and Sensor Tower | Press reports | 2026 | https://www.theregister.com/on-prem/2026/01/02/apple-meta-ship-significantly-fewer-vr-headsets-in-2025/2670882 ; https://www.mactech.com/2026/01/02/apple-reportedly-further-scales-back-production-marketing-of-the-vision-pro | IDC estimates: about 390,000 Vision Pro units in 2024, about 45,000 in Q4 2025, and 5.6 M Quest units in 2024. The FT reports that production and marketing were scaled back. | Second-hand, but the only unit estimates for Vision Pro and Quest found. |

## 2. Deep notes

### E01: Dehghani et al. 2021, consumer perceptions of VR devices after purchase

**Problem.** What makes people who already own a VR device continue using it (continuance), as opposed to adopting it in the first place?

**Method.** The study had two parts.
- Study 1 was a netnographic content analysis of 3,205 Amazon verified-purchase reviews (2,335 positive, 870 critical) of the ten most popular VR products "as of 2019". These were HTC Vive (1,142 comments), Oculus Rift (1,135), Google Cardboard (344), Daydream View (218), Samsung Gear (92), PlayStation VR (77), HTC Vive Pro (72), Lenovo Mirage Solo (52), Homido V2 (54) and Merge VR (19). The reviews came to 460 pages of transcripts, coded in NVivo 12 by a single coder (intra-rater reliability checked).
- Study 2 was a survey of VR users recruited through the ten most active VR groups on Facebook, from November 2019 to January 2020. There were 136 responses. 8 people who had received the device as a gift were removed, and the analysed sample was 119. The model was tested with PLS-SEM (SmartPLS 3.2.8, 1,000 bootstrap resamples), based on IS continuance theory.

**Data and results.**
- Share of codes per theme in Study 1 (Table 3, "percentage" column):
  - Perceived discomfort: 39%. Example: "The first couple of days using the Vive gave was uncomfortable".
  - Perceived focused immersion: 39%.
  - Perceived functional benefit / task quality: 34%.
  - Temporal dissociation: 34%.
  - Perceived visual appeal: 30%.
  - Perceived health risk: 30%.
  - Perceived complementary goods (content): 21%. Example: "Limited contents and most of the available contents require purchase".
  - Perceived external compatibilities (needing a new PC): 21%.
  - Interoperability: 12%.
  - Health motivation: 11%.
  - Perceived spatial quality (room size): 11%.
  - **Effort expectancy: 7%.** This is the ease-of-use / complexity theme. The example is about remembering controller buttons: "trying to remember where the buttons are is not instinctual yet".
  - Hedonic motivation: 7%.
  - Perceived interactivity: 3%.
  - Aesthetic appeal: 2%.
- Study 2 (Table 6; the sign symbols in the PDF render as a negative sign):
  - Perceived discomfort lowered continuance intention (β = −0.159, p = 0.034) and usage (β = −0.262, p = 0.014).
  - Perceived health risk lowered continuance intention (β = −0.234, p = 0.002).
  - Temporal dissociation raised usage (β = 0.294, p < 0.001).
  - Task quality raised usage (β = 0.229; the table's p and t columns appear swapped for this row).
  - Continuance intention raised usage (β = 0.452, p = 0.002).
  - Effort expectancy was not carried into Study 2.
- The discussion names "nausea and motion sickness while wearing the headset for extended periods" as a consumer issue and recommends attention to comfort.

**Limitations.**
- The devices are from 2016–2019, mostly PC-tethered and phone-based. There were no standalone Quest headsets and no mixed-reality passthrough.
- Study 1 used a single coder.
- Study 2 is a small (N = 119) enthusiast sample from Facebook groups.
- Theme percentages do not sum to 100, and the paper does not define them precisely.
- Reviews are written near the time of purchase, so they say little about abandonment months later.

**Transfers to agents.**
- Interaction friction exists but is a minority theme (7% of codes). The example is about learning controller mappings, which a guiding agent could teach in context.
- Compatibility and setup themes (21% external compatibilities, 12% interoperability) are partly configuration problems that an agent could take on.

**Does not transfer.** The two largest negative drivers, physical discomfort and perceived health risk, are hardware and physiology problems. No software agent removes them. In this study they, not interface complexity, are the measured predictors of lower continuance.

### E02: Tran et al. CHI 2025, wearable AR in everyday contexts

**Problem.** How do early adopters actually use consumer AR/MR headsets and glasses over days to months, outside the lab?

**Method.**
- Digital ethnography of YouTube videos. The search found 305 videos, and 112 were kept: 36 excluded as sponsored, 97 for unclear usage duration, 60 as demos, reviews or first impressions.
- The kept videos total 26 h 53 min and range from 2 min to 1 h 4 min.
- Devices had to be consumer devices released June 2022 to June 2024. The sample was Vision Pro 64 (57.1%), Ray-Ban Meta 21 (18.8%), Quest 3 19 (16.9%), XREAL 6 (5.4%) and Viture 2 (1.8%).
- Two coders applied a coding framework to a 10% sample, then coded the full set. Data were collected in mid-July 2024.

**Data and results.**
- Length of use shown: hours 13.4%, weeks 56.2%, months 30.4%. In 82 videos (73.2%) the creator reflects on use after a period of time.
- Main uses are media consumption and gaming. Productivity is wanted, but "frequent use is constrained by current hardware limitations and the nascent application ecosystem".
- Pain points reported:
  - Weight, felt more when leaning forward to work.
  - Eye strain and headaches.
  - Battery (Quest users carried power banks).
  - Poor low-light tracking.
  - Many visionOS apps were iPad ports, and native YouTube and Spotify apps were missing. Some apps crashed during long sessions.
  - Lack of precise input such as a mouse.
  - Hand tracking degraded in the dark.
  - Travel Mode had to be enabled manually, and some users did not know it existed.
  - Loneliness ("It's just you in there. It's kind of lonely") and difficulty for bystanders to tell whether the wearer was available.
  - Safety warnings that hide content when the wearer moves.
  - Ray-Ban Meta's recording LED was hard to see in daylight.
- Users want their headset or glasses to continue their phone, tablet and computer experience.

**Limitations.**
- Self-selected YouTube creators, judged to be 90.2% male by visual assessment and mostly North American.
- Heavy Vision Pro skew.
- Sponsored videos were excluded, which under-samples cheap display glasses.
- Short- to medium-term use only.
- The paper does not analyse learning curve or interface complexity as a theme.

**Transfers to agents.**
- Several pain points are discoverability or configuration problems: the hidden Travel Mode, window management by voice (praised, but "not a complete substitute"), and continuity with other devices.
- Imprecise input is a problem an agent can sidestep by acting on the user's behalf.
- This is the most direct peer-reviewed evidence that some everyday friction is in the interaction layer.

**Does not transfer.** The dominant constraints (weight, eye strain, battery, missing native apps, social isolation, safety) are hardware, ecosystem or social problems.

## 3. Market numbers

| Metric | Value | Period | Source ID | Type | Date of source |
|---|---|---|---|---|---|
| AR/VR headset shipments, worldwide | 11.2 M ("pandemic-era peak") | 2021 | E11 (2025-03-25) | Estimate (IDC tracker) | 2025-03-25 |
| AR/VR headset shipments | 8.8 M, −20.9% YoY | 2022 | E11 (2023-03-08) | Estimate (IDC) | 2023-03-08 |
| AR/VR headset shipments | −23.5% vs 2022 (≈6.7 M, derived) | 2023 | E11 (2024-03-05) | Estimate (IDC); unit total derived by us | 2024-03-05 |
| IDC's own forecast for 2023 made in Dec 2023 | 8.1 M (−8.3%); 2027 forecast 28.6 M | 2023 / 2027 | E11 (2023-12-20) | Forecast (IDC) | 2023-12-20 |
| AR/VR headset shipments | +10% YoY (≈7.4 M, derived). Meta 74.6%, Apple 5.2%, Sony 4.3%, ByteDance 4.1%, XREAL 3.3% | 2024 | E11 (2025-03-25) | Estimate (IDC); unit total derived by us | 2025-03-25 |
| IDC forecast made in Mar 2025 | 2025 −12%, 2026 +87%, CAGR 38.6% for 2025–2029 | 2025–2029 | E11 (2025-03-25) | Forecast (IDC) | 2025-03-25 |
| XR devices including glasses | 14.5 M, +41.6% (forecast). MR/VR headsets −42.8% (forecast). Rest of XR +211.2% | 2025 | E11 (2025-12-11) | Forecast (IDC) | 2025-12-11 |
| XR devices including glasses | +44.4% YoY. Meta share 72.2%. Meta Quest shipments −42.3%. Display-less glasses are the majority | 2025 | E11 (2026-03-23) | Estimate (IDC) | 2026-03-23 |
| XR forecast | 2026 +33.5%; CAGR 26.5% for 2026–2030. Display glasses to pass VR/MR headsets in volume by 2027 | 2026–2030 | E11 (2026-03-23) | Forecast (IDC) | 2026-03-23 |
| Display-less smart glasses | ≈2.25 M in Q1 2026 (+167% YoY). Meta share of XR in Q1 2026: 69.2% | Q1 2026 | E11 (blog 2026-06-15) | Estimate (IDC) | 2026-06-15 |
| 2026 forecasts by class | Display-less glasses ≈13.6 M; MR headsets 3.2 M; display glasses 3 M | 2026 | E11 (blog 2026-06-15) | Forecast (IDC) | 2026-06-15 |
| VR headset shipments | −14% YoY (H1 2025); −28% YoY (FY2025); −44% YoY (Q4 2025). Meta ≈80% share (H1 2025) | 2025 | E12 | Estimate (Counterpoint) | 2025-09-25; 2026-03-11 |
| AR smart glasses shipments | +50% YoY (H1 2025); +108% YoY (FY2025) | 2025 | E12 | Estimate (Counterpoint) | 2025-09-25; 2026-03-11 |
| VR headset sales (Omdia definition) | 6.9 M in 2024, down 10% from 7.7 M in 2023 | 2023–2024 | E13 | Estimate (Omdia) | 2024-12-12 |
| VR headsets in active use | 21.9 M, −8% | 2024 | E13 | Estimate (Omdia) | 2024-12-12 |
| Quest 2 cumulative sales | "over 20 million" since 2020 | 2020–2024 | E13 | Estimate (Omdia) | 2024-12-12 |
| Meta Reality Labs revenue / operating loss | $2,146 M / −$17,729 M | FY2024 | E14 | Reported (company) | 2026-01-28 |
| Meta Reality Labs revenue / operating loss | $2,207 M / −$19,193 M | FY2025 | E14 | Reported (company) | 2026-01-28 |
| Meta Reality Labs revenue / operating loss | $955 M / −$6,021 M (Q4 2024: $1,083 M / −$4,967 M) | Q4 2025 | E14 | Reported (company) | 2026-01-28 |
| Meta Reality Labs revenue / loss from operations | $443 M / −$4,129 M (Q3 2025: $470 M / −$4,432 M). Nine-month revenue $1,276 M (2025: $1,252 M) | Q3 2026 | E14 (10-Q) | Reported (company) | 2026 (Q3 10-Q) |
| Meta guidance for Reality Labs 2026 losses | "similar to 2025 levels" (Jan 2026); $18–19 B (Oct 2026, as reported by MIXED) | 2026 | E14; MIXED (https://mixed-news.com/en/meta-quest-sales-fall-vr-hardware-breakthroughs-q3-2026/) | Company guidance; the Oct figure is a press report | 2026-01-28; 2026-10-28 |
| Ray-Ban Meta + Oakley Meta AI glasses sold | more than 7 M | 2025 | E15 | Reported (company), read via UploadVR and the release snippet | 2026-02-11 |
| Ray-Ban Meta units, launch to Feb 2025 | 2 M (Oct 2023 – Feb 2025) | 2023–2025 | E15 (UploadVR) | Company statement, as reported by the press | 2026-02-11 |
| EssilorLuxottica production capacity target | 10 M units per year by end of 2026 | 2026 | E15 (UploadVR) | Company plan, as reported by the press | 2026-02-11 |
| Apple Vision Pro price and launch | $3,499 (256 GB), US sales from 2024-02-02 | 2024 | E16 | Reported (company) | 2024-01-08 |
| Vision Pro with M5 | $3,499; available 2025-10-22; "up to two and a half hours of general use" | 2025 | E16 | Reported (company) | 2025-10-15 |
| Meta Ray-Ban Display | "Starting at $799 USD, which includes both the glasses and Meta Neural Band"; on sale 2025-09-30 (US) | 2025 | E16 | Reported (company) | 2025-09-17 (updated 2025-09-30) |
| Samsung Galaxy XR (first Android XR device) | $1,799 ($1,799.99 per MacRumors); available 2025-10-21 US / 2025-10-22 Korea | 2025 | E16 | Availability: company; price: press report | 2025-10-21/22 |
| Vision Pro shipments | ≈390,000 (≈$1.4 B revenue) | 2024 | E20 (The Register) | IDC estimate, as reported by the press | 2026-01-02 |
| Vision Pro shipments | ≈45,000 in Q4 2025 (MacTech). The Register gives ≈45,000 for 2025 and says none shipped in Q1–Q3 | 2025 | E20 | IDC estimate, as reported by the press (sources disagree on the period) | 2026-01-02 |
| Quest + Quest Pro shipments | 5.6 M (≈$2.9 B) in 2024; 1.7 M in Q1–Q3 2025 | 2024–2025 | E20 (The Register) | IDC estimate, as reported by the press | 2026-01-02 |
| Vision Pro production and marketing | Scaled back. Sensor Tower: digital ad spend down more than 95% in 2025 in markets such as the US and UK | 2025 | E20 (MacTech, relaying the FT) | Press report | 2026-01-02 |
| Smartphone shipments, worldwide | 1,260.3 M (2025); 1,236.3 M (2024) | 2024–2025 | E17 | Estimate (IDC, preliminary) | 2026-01-13 |
| Teen VR ownership and use (US) | 29% own; of owners, 4% daily and 14% weekly; 7% plan to buy | Spring 2023 | E19 | Survey (Piper Sandler), as reported by the press | 2023-04-04 |

Scale check (derived): 14.5 M XR devices in 2025 is about 1.2% of the 1,260.3 M smartphones shipped the same year. The more than 7 M Meta AI glasses are about 0.6%.

## 4. Barriers named in the evidence

| Barrier | Evidence with IDs | Is interface complexity / usability involved? |
|---|---|---|
| Price / value for money | E18 (price 67% in Jun 2023 and 65.5% in Feb 2024 among Vision Pro non-buyers; hardware cost 31% for VR video). E12 (nearly half of 10 Vision Pro testers likely to buy, but at a preferred price of $1,000–2,000). E04 (trial lowers purchase intention). E08 (price sensitivity moderates value). E11 (Dec 2023: rising prices "risk alienating some consumers") | No |
| Physical discomfort, weight, wearing time | E01 (39% of codes; β = −0.159 on continuance, −0.262 on usage). E18 (33% "uncomfortable for extended periods" for VR video; 15–19% for Vision Pro). E12 (most testers comfortable for under an hour; front-heavy, 600–650 g). E02 (weight, eye strain). E08 (wearable comfort drives glasses' value) | No |
| Lack of content, apps or use case; substitutes are good enough | E01 (complementary goods 21%). E02 (iPad ports, missing native apps; media and games dominate). E13 ("new content is limited", engagement dwindled). E11 (demand narrowing to gaming). E18 ("can use phone, TV or laptop" 20.9–29%; "same content on my TV" 32%; "not enough content" 12–14%) | Partial: missing productivity tools also mean missing input precision (E02) |
| Cybersickness and health concerns | E10 (pooled SSQ 28.00). E01 (health risk 30% of codes; β = −0.234 on continuance; nausea in long sessions). E18 (13.5–19%) | Partial: locomotion and interaction design affect sickness (E10) |
| Social isolation and social acceptability | E18 (isolation 10.2–16%; wanting to share viewing 30%). E02 (loneliness; bystanders cannot read availability). E09 (non-owners expect others to be offended; privacy concerns) | No |
| Battery, heat, tracking hardware | E02 (power banks; low-light hand tracking). E16 (Vision Pro M5: up to 2.5 h general use) | No |
| Setup, compatibility, configuration | E01 (external compatibilities 21%, interoperability 12%). E03 ("technical effort" of tethered and mobile VR). E02 (Travel Mode must be enabled manually) | Partial: configuration and discoverability are interface problems |
| Learning the interaction (controllers, eyes and hands, gestures), ease of use | E01 (effort expectancy 7%; controller buttons "not instinctual yet"). E12 ("a bit of a learning curve when using the eyes, hands and gestures"; 10 testers). E07 (ease of use is an acceptance driver for glasses). E05 (cognitive affordance drives usefulness and enjoyment). E02 (no precise input; voice window management helps). E18 ("not aware of its capabilities" 21–22.3%). Counter-evidence: E06 (early adopters list "intuitive user interface" as a positive affordance) | **Strong** as a category (this row is the usability barrier itself). Its measured weight is small to moderate, never the top-ranked factor |
| Market-level explanations by analysts | E11 (headset demand narrowing to gaming; glasses win on everyday wearability). E13 (engagement, content, developer ROI). E11 (Dec 2025): "Convincing someone who doesn't need prescription eyewear to wear glasses all day is far more challenging" | No. Analysts never name UI complexity |

## 5. Facts and numbers

- 3,205 Amazon reviews of 10 VR devices were coded. Discomfort was 39% of codes and effort expectancy (ease of use) 7% [E01, https://doi.org/10.1080/0144929X.2021.1876767].
- In a sample of 119 users, perceived discomfort lowered continuance intention (β = −0.159) and usage (β = −0.262). Perceived health risk lowered continuance intention (β = −0.234) [E01, https://doi.org/10.1080/0144929X.2021.1876767].
- In 112 YouTube videos (≈27 h) of sustained AR/MR use, use was mainly media and gaming. Productivity was limited by hardware and the app ecosystem [E02, https://doi.org/10.1145/3706598.3713572].
- After an extensive metaverse trial (almost 100 participants), intention to use headsets rose but intention to purchase fell [E04, https://doi.org/10.1177/10949968241263353].
- The pooled SSQ total across 55 HMD studies (3,016 participants) was 28.00, which the authors call "relatively high" against cut-offs. Gaming content was highest at 34.26 [E10, https://doi.org/10.3389/fnhum.2020.00096].
- IDC: AR/VR headset shipments peaked at 11.2 M in 2021, fell to 8.8 M in 2022 and fell another 23.5% in 2023 [E11, https://www.idc.com/resource-center/press-releases/growth-expected-to-pause-for-ar-vr-headsets-according-to-idc/].
- IDC repeatedly over-forecast. In December 2023 it expected 8.1 M units in 2023 and 28.6 M in 2027 [E11, https://www.idc.com/resource-center/press-releases/ar-vr-headset-market-forecast-to-decline-8-3-in-2023-but-remains-on-track-to-rebound-in-2024-according-to-idc/].
- IDC: XR shipments grew 44.4% in 2025, but Meta's Quest shipments fell 42.3%, and display-less glasses became the majority of XR shipments [E11, https://www.idc.com/resource-center/press-releases/xr-market-grew-44-4-in-2025-as-smart-glasses-redefine-the-category/].
- Counterpoint: VR headset shipments fell 28% in FY2025, and AR smart glasses grew 108% [E12, https://counterpointresearch.com/en/reports/Global-AR-VR-Market-Insights-and-Development-Trends-Q4-2025].
- Omdia: VR headsets in active use fell 8% to 21.9 M in 2024. Omdia says VR "will remain a niche market as long as it remains in its current form" [E13, https://prnewswire.com/news-releases/reality-check-for-vr-omdia-forecasts-decline-as-apples-entry-fails-to-galvanize-market-302330338.html].
- Meta Reality Labs lost $19,193 M on $2,207 M of revenue in 2025 [E14, https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/].
- In Q3 2026, Reality Labs revenue fell to $443 M from $470 M. Its loss from operations was $4,129 M [E14, https://www.sec.gov/Archives/edgar/data/0001326801/000162828026066773/meta-20260930.htm].
- EssilorLuxottica sold more than 7 M Ray-Ban Meta and Oakley Meta AI glasses in 2025 [E15, https://uploadvr.com/meta-essilorluxottica-sold-7-million-smart-glasses-in-2025/].
- Vision Pro launched at $3,499 on 2024-02-02. The M5 refresh kept $3,499 and quotes up to 2.5 h of general use per charge [E16, https://www.apple.com/newsroom/2025/10/apple-vision-pro-upgraded-with-the-m5-chip-and-dual-knit-band/].
- Meta Ray-Ban Display costs $799 including the Neural Band, which takes EMG finger-gesture input [E16, https://about.fb.com/news/2025/09/meta-ray-ban-display-ai-glasses-emg-wristband/].
- IDC estimates (as reported by the press) put Vision Pro shipments at ≈390,000 in 2024 [E20, https://www.theregister.com/on-prem/2026/01/02/apple-meta-ship-significantly-fewer-vr-headsets-in-2025/2670882].
- 1,260.3 M smartphones were shipped in 2025 (IDC, preliminary) [E17, https://www.idc.com/resource-center/press-releases/q425mobilephonetop5/].
- Vision Pro non-buyers (Feb 2024, N=1,069) gave these reasons: price 65.5%, not aware of its capabilities 22.3%, phone/TV/laptop suffice 20.9%, uncomfortable 15%, nausea 13.5%, not enough content 12.2%, isolation 10.2% [E18, https://datawrapper.dwcdn.net/tcgki/1/].
- Among US adults not interested in watching video in VR (Feb 2024, N=1,069), the top reason was discomfort over long periods (33%) [E18, https://datawrapper.dwcdn.net/VDWc3/3/].
- In spring 2023, 4% of teen VR owners used the device daily and 14% weekly [E19, https://www.cnbc.com/2023/04/04/american-teens-not-into-virtual-reality-only-4percent-use-it-daily-.html].

## 6. Open problems / how strong the "complexity hinders adoption" claim is

**Verdict: weak to moderate as a direct claim, and moderate as a contributing claim.** The evidence does not support the claim that interface complexity is *the* main reason XR has not gone mainstream.

**Price, comfort, content/value and sickness dominate.**
- Every survey with ranked reasons puts these factors first (E18).
- The only peer-reviewed continuance model with significant negative paths finds them in discomfort and health risk (E01).
- No analyst release from IDC, Counterpoint or Omdia names UI complexity. They name content, engagement, gaming-only demand, price and form factor (E11–E13).
- E04 shows that people who used a headset for an extended trial wanted to *use* it more but *buy* it less. That pattern suggests value and price, not inability to operate the device.

**Where usability appears.**
1. It appears as a minor but real theme in owner reviews: "effort expectancy" was 7% of codes, with controller mappings "not instinctual yet" (E01).
2. Analysts testing the device note "a bit of a learning curve" with eyes, hands and gestures (E12), but this rests on 10 testers.
3. In everyday use, the reported friction is about imprecise input, hidden modes, window management and missing continuity with phone and PC (E02). These are interaction-layer problems an agent could address.
4. In acceptance models, "ease of use" (E07) and "cognitive affordance" (E05) are significant antecedents, but they sit alongside usefulness, comfort and social norms.
5. "Not aware of its capabilities" (22.3%, E18) is a discoverability problem, which is closer to the agent thesis than raw complexity.

**Counter-evidence.**
- Early adopters describe the Vision Pro interface as intuitive (E06).
- The device class that grew fastest in 2025 is display-less AI glasses, which have almost no spatial GUI (E11, E15).
- This can be read two ways. "Simpler interaction wins" supports the column's thesis. "Cheaper, lighter and fashionable wins" does not. The data cannot separate the two, because price, weight and UI simplicity change together.

**Gaps in the evidence.**
- None of the surveys found offers "too hard to use" or "too complicated" as an answer option, so they cannot detect complexity as a barrier.
- No peer-reviewed longitudinal study of consumer headset abandonment (diary or telemetry, months long, with exit interviews) was found for Quest-era or Vision Pro-era devices. The Biener et al. Vision Pro interviews (Part C, C16) cover continued users, not people who stopped.
- Most peer-reviewed data predate standalone MR. E01 covers 2016–2019 devices.

**Honest framing for the column.** "Operating 3D interfaces is harder than operating a phone, and this adds to the price, comfort and content barriers that dominate the evidence. It shows up mainly as learning, discoverability, input precision and configuration effort. An agent can lower these costs. It cannot fix weight, price or sickness."

## 7. Figure / widget ideas

1. **Shipments on a log scale, 2021–2026: XR vs smartphones.** One line for AR/VR headsets: IDC 11.2 M (2021), 8.8 M (2022), ≈6.7 M (2023, derived), ≈7.4 M (2024, derived). A second line or point set for XR including glasses: 14.5 M (2025) and the 2026 forecast. A bar for Meta AI glasses (more than 7 M in 2025). A flat line for smartphones at ≈1.24–1.26 B. Annotate the 2–3 orders of magnitude gap. Mark derived points with hollow markers, and overlay IDC's December 2023 forecast (8.1 M in 2023, 28.6 M in 2027) as a dashed line to show the forecast misses.
2. **"Why not?" ranked bars from the two VIP+ surveys (E18).** Feb 2024 Vision Pro non-buyers next to VR-video non-viewers, with items coloured by category: price, comfort, content/substitutes, sickness, social, awareness. Add a greyed "too hard to use: not asked" bar to make the measurement gap visible.
3. **Meta Reality Labs revenue vs operating loss, 2024 – Q3 2026 (E14).** Paired bars per period. The loss is about 8–9× revenue each year (e.g., FY2025: $2.2 B revenue vs $19.2 B loss).

## 8. Unverified

- **Final 2025 MR/VR headset decline.** The −42.8% figure is IDC's December 2025 *forecast*. The March 2026 release gives Quest at −42.3% but no final headset-only total.
- **Full-year 2025 Vision Pro shipments.** The Register (relaying IDC) says ≈45,000 for 2025 and none in Q1–Q3. MacTech (relaying IDC) says ≈45,000 *in Q4 2025*. The Register's 2026 forecast of 290,000 units was not checked against IDC.
- **Meta Ray-Ban Display volume.** "20,000 units in Q3 2025" appears in The Register without a named source.
- **The FT report itself (Jan 2026) on Vision Pro cuts.** It is paywalled and was read only through MacTech. Secondary reports also say Luxshare halted production in early 2025. Earlier reports (The Information, Oct 2024) of production wind-down were seen only in search snippets.
- **Galaxy XR sales.** No reliable source was found. A blog cites ≈40,000 units in 2025 attributed to IDC/Counterpoint, which could not be traced. The Elec reported a production plan of about 100,000 units (seen only in a snippet).
- **Android XR glasses (Samsung/Google with Warby Parker and Gentle Monster).** Launch dates and prices reported in November 2026 conflict across outlets (e.g., $395–$489 per Android Central against "no price announced" elsewhere). Not verified.
- **Bloomberg report of raising Ray-Ban Meta capacity to 20–30 M units.** Read only via UploadVR and heise.
- **EssilorLuxottica's exact wording.** The phrase "more than 7 million units" was read via UploadVR and a search snippet of the release. The release page itself did not render.
- **Counterpoint category scope.** A search snippet said Counterpoint's AR smart glasses figures exclude display-less glasses such as Ray-Ban Meta. The report page did not state this.
- **Piper Sandler spring 2024.** 33% of teens own VR and 13% use it weekly, seen only via Gigazine. The 2022 figure that 48% of owners "seldom" use their device was also seen only in a snippet.
- **Teen and adult usage claims in BGR and blog roundups.** These include "57.3% of VR users experienced motion sickness" from a "University of Indonesia study"; it was not traced to a paper.
- **Koukopoulos et al. 2024, "Apple Vision Pro: A Reddit-Based Sentiment Analysis".** Proceedings of ICCMI, https://doi.org/10.12681/iccmi.7614. Metadata verified, but the results were not read, so it is not in the table.
- **Berrezueta-Guzman et al., "Apple Vision Pro: The good, the bad, the ugly".** arXiv 2610.40108, a systematic review of 104 papers submitted 2026-10-29. Only the abstract was read. It may be useful for Part A or B.
