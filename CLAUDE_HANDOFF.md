# Screenwords — Claude Devir (Handoff) ve Mimari Geliştirme Dokümanı

> **Bu dokümanın amacı:** Screenwords projesinde şu ana kadar yapılan mimari düzeltmeleri özetlemek, mevcut görsel/anatomik eksikleri netleştirmek ve **yeni bir MCP endpoint'i (`human` vb.) uydurmadan** AI'ın HTML5/SVG/Canvas motoru üzerinden **Kurzgesagt / Vox / Apple Keynote kalitesinde** insan figürleri, objeler, oranlar ve akıcı animasyonlar üretebilmesi için yapılacak geliştirmeleri adım adım tanımlamaktır.

---

## 1. Kullanıcının Temel Vizyonu ve Kesin Kurallar (CRITICAL RULES)

1. **Asla Özel İçerik Endpoint'i Açma (`human` vb. YASAK):**
   - AI bir insan, araba, gezegen, el, diyagram veya herhangi bir sahne çizmek istediğinde bunun için Rust/MCP tarafında `human`, `car` gibi yeni bir MCP endpoint'i **oluşturulmamalıdır**.
   - Motor; HTML5, SVG ve 2D Canvas üzerinde çalışan **genel amaçlı (generic), yüksek kapasiteli bir görsel derleyici ve sahne grafiği (scene-graph) çalışma zamanı** olmalıdır.
2. **Motor (`src/`) vs. Proje (`project.json`) Ayrımı:**
   - `src/`, `player.html`, `editor.html`, `02-helpers.js`, `19-base.js` içine **asla** tek bir videoya özel metin, renk veya sabit içerik gömülmemelidir.
   - Tüm video içeriği ve sahne tanımları yalnızca projenin `project.json` dosyası içindeki bileşen parametrelerinde (`params`) yaşamalıdır.
3. **Neden Mevcut İnsan Çizimi Yetersiz?**
   - Şu anki `SWDraw.character` (`src/assets/components/02-helpers.js` satır `284–425`), `ctx.arc` (yuvarlak kafa), `ctx.roundRect` (dikdörtgen gövde) ve `ctx.lineTo` (düz çizgi kol/bacak) kullandığı için **"çöp adam / basit kapsül"** gibi görünüyor.
   - Kullanıcının beklentisi: **Anatomik oranlara sahip (8-head veya stilize Kurzgesagt/Duolingo/Notion illüstrasyon oranlarında)**, omuz-boyun-köprücük kemiği geçişleri yumuşak Bézier eğrileriyle birleşen (mesh/envelope skinning), gerçek eklem hacmi olan, el/parmak detayı bulunan, yüz ifadeleri (kaş, göz, bakış yönü, fonetik dudak şekilleri / viseme) olan ve estetik kıyafet/saç katmanlarına sahip **gerçek bir vektör illüstrasyon kalitesi**.
4. **Neden HTML5 / SVG Gücünü Tam Kullanmıyoruz?**
   - Her şeyi zaten tarayıcı / HTML5 üzerinden render ediyoruz (`player.html` ve `editor.html`). Salt ilkel `ctx.arc` / `ctx.fillRect` çağrılarıyla sınırlı kalmak yerine, **HTML5 `<svg>`, `Path2D`, Cubic Bézier zarfları (Variable-Width Stroke / Tapered Bézier Outlines), SVG filtreleri/gradyanları ve katmanlı vektör iskelet (2D Rigging & Skinning)** yeteneklerini tam kapasite kullanmalıyız.

---

## 2. Önceki Oturumda Tamamlanan Düzeltmeler (Tekrar Araştırma Yapma)

Aşağıdaki sorunlar **çözüldü** ve `cargo test` (**113/113 test**, 0 uyarı) geçiyor:

1. **`position` Split-Brain Hatası Çözüldü:**
   - `src/edits.rs` (` satır 65–135`): `add_component` ve `update_component` artık üst seviye `c.position` ile `c.params.position` alanlarını senkron tutuyor.
   - `src/render.rs` (`satır 365–445`): `render_data_in` artık `keyframes`, `position` ve `zIndex` alanlarını eksiksiz olarak player JSON'una aktarıyor.
   - `src/assets/components/19-base.js` (`satır 21–105`): `drawSharedComponents` bileşenleri `zIndex` sırasına göre diziyor, `c.position` ile `c.params.position`'ı birleştiriyor ve `c.keyframes` (`x, y, scale, opacity`) enterpolasyonu yapıyor.
2. **Okların (`arrowPointer`) Hedef Kutusuna Kenetlenmesi (Bounding-Box Docking):**
   - `src/assets/components/02-helpers.js` (`satır 120–185`): `ecComponentBox(c, W, H)` ve `ecDockRayToBox(x0, y0, x1, y1, box, pad)` eklendi.
   - `src/assets/components/19-base.js` (`satır 350–435`): `arrowPointer` artık De Casteljau karesel Bézier eğrisiyle çiziliyor, `targetId` veya hedef koordinattaki bileşenin dış çerçevesine kenetleniyor ve `label` kapsülünü çiziyor.
3. **DOM vs. Canvas Oran ve Pozisyon Düzeltmeleri:**
   - `src/assets/player.html` (`satır 700–780`) ve `src/assets/editor.html` (`satır 1066–1145`): `#title`, `#counter`, `#lower` artık `position` (`x, y`) değerlerine uyuyor.
   - `statBadge`, `chapterCard`, `gaugeMeter`, `badgePill`, `circleShape` oranları ve eksik parametreleri (`subtitle`, `label`, `value`, `max`, `color`, `fontFamily`) düzeltildi.
4. **Temel `SWDraw` (`window.SWDraw`) Altyapısı Eklendi:**
   - `src/assets/components/02-helpers.js` (`satır 191–465`) içine `SWDraw` eklendi ve `19-base.js` içinde `codeOverlay_<slug>` bileşenlerine 8. argüman (`sw`) olarak geçirildi.

---

## 3. Şimdi Yapılması Gerekenler (Claude İçin Görev Listesi)

### Görev 1: "Çöp Adam" (`ctx.arc` + `ctx.lineTo`) Yerine Anatomik Bézier Skinning ve Katmanlı Vektör Karakter Motoru (`SWDraw.character` v2)

`src/assets/components/02-helpers.js` içindeki `SWDraw.character` fonksiyonunu baştan aşağı profesyonel bir **2D Vektör İllüstrasyon & Rigging** motoruna dönüştür:

1. **Anatomik Kontur ve Hacimli Uzuvlar (`SWDraw.anatomicalLimb` / `SWDraw.skinnedBone`):**
   - Kolları ve bacakları tek bir `ctx.stroke()` çizgisiyle çizmek yerine, **omuz genişliği → pazı kası → dirsek kıvrımı → önkol incelmesi → bilek** noktalarından geçen **kapalı Cubic Bézier zarfı (filled closed Bézier contour)** olarak çiz.
   - Üst uzuv ve alt uzuv birleşiminde (dirsek ve diz) iç bükey/dış bükey yumuşak teğet geçişi hesapla; eklem yerlerinde kopukluk veya üst üste binen yuvarlak uçlar olmasın.
   - Kıyafet katmanı (ceket kolu, tişört kolu, pantolon paçası, yaka, kravat/kapüşon detayları) uzuv açısını takip eden gerçek Bézier poligonlarıyla çizilsin; dirsek büküldüğünde kumaş kıvrım gölgesi (`ambient occlusion`) eklensin.

2. **Anatomik Baş, Boyun, Saç ve 3/4 Perspektif (`headTurn` & `headTilt`):**
   - Kafayı düz bir `ctx.arc` daire yapmak yerine, **çene hattı (jawline), elmacık kemiği, kulak, boyun ve trapez kası** geçişi olan gerçek bir baş silüeti (`Path2D` / Bézier) olarak çiz.
   - `headTurn` (`-1..+1` sağa/sola bakış) ve `headTilt` (`-1..+1` yukarı/aşağı eğim) parametrelerine göre yüz özelliklerini (burun köprüsü, gözlerin perspektif genişliği, kulakların konumu, saç hacmi) **2.5D paralaks** ile kaydır.
   - Farklı saç modelleri (`style: 'modern' | 'curly' | 'bun' | 'short' | 'wavy'`) için arka saç katmanı (kafanın arkasında) ve ön perçem katmanı (alnın üstünde) ayrımı yap.

3. **Zengin Yüz İfadeleri ve Fonetik Dudak Senkronizasyonu (Viseme Lip-Sync):**
   - `SWDraw.mouthOpen` sadece yüksekliği açıp kapatan siyah bir elips çizmemeli.
   - Konuşulan kelimenin (`words` dizisindeki aktif kelime) harflerinden anlık **Viseme** üret:
     - `'A' / 'E' / 'I'` → Geniş açık ağız, üst diş sırası ve dil detayı görünür.
     - `'O' / 'U' / 'W'` → Yuvarlak büzülmüş dudak formu.
     - `'M' / 'B' / 'P'` → Kapalı basılı dudak çizgisi.
     - `'F' / 'V' / 'S'` → Hafif aralık diş-dudak formu.
   - Duygu durumları (`emotion: 'neutral' | 'happy' | 'excited' | 'thinking' | 'surprised' | 'focused'`): Kaş yaylarını, göz kapağı açıklığını, göz bebeği parlama noktasını (specular highlight) ve yanak/ağız kenarı kıvrımlarını duyguya göre şekillendir.

4. **Eklemli El ve Parmak Çizimi (`SWDraw.hand`):**
   - Bilek ucuna pembe bir top (`ctx.arc`) koymak yerine, elin pozuna göre (`handPose: 'point' | 'open' | 'wave' | 'hold' | 'thumbsUp' | 'fist'`) avuç içi, başparmak ve işaret/diğer parmak silüetini Bézier yolu olarak çiz.
   - `pointAt` aktif olduğunda işaret parmağı tam hedef vektörüne dönsün, diğer parmaklar avuç içine kıvrılsın.

---

### Görev 2: HTML5 / SVG / Path2D Sahne Grafiği (Scene Graph) ve Serbest Çizim Yeteneklerini Güçlendirme

AI'ın sadece insan değil, **istediği herhangi bir nesneyi, diyagramı, ikonu veya kompleks sahneyi** kusursuz oranlarla çizebilmesi için `SWDraw` (`src/assets/components/02-helpers.js`) ve `drawSharedComponents` (`src/assets/components/19-base.js`) içine şu genel yetenekleri ekle:

1. **Tam Özellikli SVG `<svg>` / `Path2D` Çok Katmanlı Vektör Render'ı (`SWDraw.svgLayers`):**
   - AI bir `codeOverlay_*` veya `params.svgLayers` içinde birden fazla SVG path katmanı (`[{ d, fill, stroke, lineWidth, gradient, shadow, transform, trimStart, trimEnd, morphTo }]`) tanımlayabilsin.
   - **SVG Path Morphing & Trim-Path:** `Path2D` + örnekleme tabanlı kubik Bézier uzunluk tablosu ile gerçek `trimStart..trimEnd` çizim animasyonu ve iki SVG path arasında yumuşak geçiş desteği sağla.
   - **Birim Bağımsız Otomatik Ölçekleme (`viewBox` Normalizasyonu):** AI `viewBox: [0, 0, 100, 100]` veya `[0, 0, 512, 512]` içinde SVG path'leri yazdığında motor bunu sahnedeki hedef `{ x, y, width, height }` kutusuna oranlarını bozmadan (`preserveAspectRatio`) otomatik oturtsun.

2. **Sahne İçi Yerleşim, Oran ve Çarpışma Çözücü (`SWDraw.layout` & `ecComponentBox`):**
   - Bileşenlerin ve çizilen objelerin birbirinin üstüne binmesini veya sahne dışına taşmasını engelleyen **Safe-Area & Auto-Layout** yardımcıları (`sw.layout.row`, `sw.layout.column`, `sw.layout.grid`, `sw.layout.anchorTo(box, side, gap)`).
   - Okların (`arrowPointer`) ve karakterin işaret ettiği noktaların (`pointAt`), hedef bileşenin gerçek zamanlı sınır kutusuna (`ecComponentBox`) göre milimetrik hizalanması:
     - Karakter bir kartı işaret ettiğinde, elinin uzandığı nokta kartın içine girmemeli; kartın sol/sağ dış kenarından `20px–30px` açıkta durmalı ve parmak ucu tam kartın merkezine veya başlığına bakmalıdır.

3. **Fiziksel Hareket (Secondary Motion / Follow-Through):**
   - Karakter yürürken veya kolunu kaldırdığında saç uçları, ceket etekleri ve baş hareketi **yay fiziği (damped harmonic oscillator / spring)** ile ana hareketi küçük bir faz farkıyla takip etsin (Disney'in *Follow-Through & Overlapping Action* prensibi).

---

### Görev 3: Doğrulama ve Görsel Kalite Kontrol Süreci

Değişiklikleri yaptıktan sonra mutlaka şu adımları çalıştır:

1. **Rust Testleri ve Derleme:**
   ```bash
   cargo test && cargo build --release
   ```
   - `render::tests::every_catalog_component_has_a_shared_renderer`, `player_has_no_placeholder_content_constants` ve `editor_has_no_placeholder_content_constants` dahil **113 testin tamamı** geçmelidir.
2. **Görsel Kalite Doğrulaması (Showcase Render & Frame İncelemesi):**
   - `examples/screenwords-showcase` projesini yeniden render et:
     ```bash
     node /Users/halilugur/.gemini/antigravity/brain/4beb31d3-895a-434d-aa78-90f01b319b24/scratch/build_showcase.mjs
     ```
   - `ffmpeg` ile MP4'ten kareler (`png`) çıkar ve **görselleri bizzat incele**:
     - İnsan figürü artık "çöp adam / yuvarlak kafa + çizgi kol" gibi **görünmemeli**; anatomik omuz-kol-el geçişleri, yüz perspektifi, saç/kıyafet gölgelendirmesi ve viseme dudak senkronizasyonu net görünmelidir.
     - Okların yönü, eğrisi ve hedef kutusuna kenetlenme noktası kusursuz olmalıdır.
     - Fontlar, kart oranları ve sahne boşlukları (whitespace) dengeli olmalıdır.

---

## 4. İlgili Anahtar Dosyalar

- `src/assets/components/02-helpers.js` (satır `120–465`): `ecComponentBox`, `ecDockRayToBox`, `SWDraw` (`ik2`, `limb`, `svgPath`, `character`, `drawScene`) burada tanımlı. **Ana geliştirme noktası burasıdır.**
- `src/assets/components/19-base.js` (satır `21–435`): `drawSharedComponents`, `codeOverlay_*` yürütücüsü, `arrowPointer`, `statBadge`, `chapterCard`, `gaugeMeter`, `quoteBox` burada tanımlı.
- `src/assets/player.html` (satır `340–780`): Bağımsız HTML5 oynatıcı ve MP4 frame render şablonu.
- `src/assets/editor.html` (satır `1055–1285`): Web editörü sahne önizleme döngüsü.
- `src/render.rs` (satır `365–445`): Proje verisini (`project.json`) HTML/Canvas çalışma zamanına (`window.__PROJECT__`) aktaran Rust modülü.
- `/Users/halilugur/.gemini/antigravity/brain/4beb31d3-895a-434d-aa78-90f01b319b24/scratch/build_showcase.mjs`: Tanıtım videosunu (`examples/screenwords-showcase`) derleyen ve MP4 üreten test betiği.
