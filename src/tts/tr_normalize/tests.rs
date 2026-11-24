//! The normaliser against the original: each pair is a sentence and what
//! antalia_mini.text.to_model_text (1.0.1) made of it.

use super::*;

/// Sentences whose reading needs no data files.
const READINGS: &[(&str, &str)] = &[
    ("Randevunuz 14 Ekim Salı günü saat 15:30'da. Ücret 1.250 TL, kapıda ödeyebilirsiniz.", "randevunuz on dört ekim salı günü saat on beş otuzda. ücret bin iki yüz elli lira, kapıda ödeyebilirsiniz."),
    ("Dünya, yaklaşık 4,6 milyar yıl önce oluştu.", "dünya, yaklaşık dört virgül altı milyar yıl önce oluştu."),
    ("İndirimle 99,99 TL'ye düştü.", "indirimle doksan dokuz lira doksan dokuz kuruşa düştü."),
    ("₺12,50 ödedim, sonra $5 daha verdim.", "on iki lira elli kuruş ödedim, sonra beş dolar daha verdim."),
    ("Fiyat 2.350 € oldu, 3.000.000 kişi izledi.", "fiyat iki bin üç yüz elli avro oldu, üç milyon kişi izledi."),
    ("Toplantı 14.10.2026 tarihinde, 2026-03-05 değil.", "toplantı on dört ekim iki bin yirmi altı tarihinde, beş mart iki bin yirmi altı değil."),
    ("Saat 09:30'da başlıyor, 1:05:30 sürüyor.", "saat dokuz otuzda başlıyor, bir saat beş dakika otuz saniye sürüyor."),
    ("%25 indirim var, enflasyon 64,5 % oldu.", "yüzde yirmi beş indirim var, enflasyon yüzde altmış dört buçuk oldu."),
    ("3-5 gün sürer, maç 3-1 bitti, 2003-04 sezonu.", "üç ile beş gün sürer, maç üç bir bitti, iki bin üç dört sezonu."),
    ("Hava -5 derece, yarın 12°C olacak.", "hava eksi beş derece, yarın on iki derece olacak."),
    ("Bu 3/4 oranında, 7/24 açık, 45/3 numaralı daire.", "bu dörtte üç oranında, yedi yirmi dört açık, kırk beş bölü üç numaralı daire."),
    ("Pi sayısı 3,14159 kadar, 2,5 kilo aldım.", "pi sayısı üç virgül bir dört bir beş dokuz kadar, iki buçuk kilo aldım."),
    ("2. Dünya Savaşı, 3. kat, 12'nci sırada, 2.si geldi.", "ikinci dünya savaşı, üçüncü kat, on ikinci sırada, ikincisi geldi."),
    ("Sıra numaranız 12. Lütfen bekleyin.", "sıra numaranız on iki. lütfen bekleyin."),
    ("II. Abdülhamid ve Warcraft III oyunu.", "ikinci abdülhamid ve warcraft üç oyunu."),
    ("Dr. Ayşe Yılmaz ve Prof. Mehmet Kaya geldi.", "doktor ayşe yılmaz ve profesör mehmet kaya geldi."),
    ("Doç.Dr. Ali bey vb. konular, vs. işler.", "doçent doktor ali bey ve benzeri konular, vesaire işler."),
    ("Atatürk Cad. No: 12 Kadıköy/İstanbul.", "atatürk caddesi numara on iki kadıköy istanbul."),
    ("TBMM, SGK ve KDV oranları; NATO toplandı.", "tebememe, segeka ve kadeve oranları; nato toplandı."),
    ("TV izledim, CEO geldi, SMS attım.", "tivi izledim, siio geldi, esemes attım."),
    ("D vitamini aldım, C blok, Ahmet K. geldi.", "de vitamini aldım, ce blok, ahmet ka geldi."),
    ("5 kg şeker, 2 lt süt, 30 cm boy, 100 m koştu.", "beş kilogram şeker, iki litre süt, otuz santimetre boy, yüz metre koştu."),
    ("Saatte 90 km/s hızla gitti.", "saatte saatte doksan kilometre hızla gitti."),
    ("Ev 120 m2 büyüklüğünde.", "ev yüz yirmi metrekare büyüklüğünde."),
    ("RANDEVUNUZ ONAYLANDI LÜTFEN GELİNİZ.", "randevunuz onaylandı lütfen geliniz."),
    ("T.C. vatandaşıyım, A.B.D. ziyaret ettim.", "tece vatandaşıyım, abede ziyaret ettim."),
    ("Yeni iPhone'u Apple Store'dan aldım.", "yeni iphone'u apple store'dan aldım."),
    ("YouTube videosunu izledim, WhatsApp'tan yazdım.", "youtube videosunu izledim, whatsapp'tan yazdım."),
    ("ChatGPT ile konuştum, LinkedIn profilime baktım.", "çet ci pi ti ile konuştum, linkedin profilime baktım."),
    ("Instagram ve Intel iyi markalar.", "instagram ve intel iyi markalar."),
    ("Siteye www.ornek.com.tr adresinden girin.", "siteye dabılyu dabılyu dabılyu nokta ornek nokta kom nokta te re adresinden girin."),
    ("Bana ali.veli@gmail.com adresinden yazın.", "bana ali nokta veli et cimeyl nokta kom adresinden yazın."),
    ("Pzt-Cum arası açığız, pazartesi-cuma.", "pazartesi-cum arası açığız, pazartesi ile cuma."),
    ("3x4 metre halı aldı, günde 2x1 tablet.", "üçe dört metre halı aldı, günde iki defa bir tablet."),
    ("Bu 1823 yılında oldu.", "bu bin sekiz yüz yirmi üç yılında oldu."),
    ("COVID-19 salgını 2020'de başladı.", "kovid on dokuz salgını iki bin yirmide başladı."),
    ("A4 kağıdı ve mp3 dosyası.", "a dört kağıdı ve mp üç dosyası."),
    ("Toplam 5 GB'lık dosya.", "toplam beş gigabaytlık dosya."),
    ("Kalan 3,5'u verdim.", "kalan üç buçuğu verdim."),
    ("Bir varmış bir yokmuş!", "bir varmış bir yokmuş!"),
    ("Ölmez ağacın gölgesinde oturduk.", "ölmez ağacın gölgesinde oturduk."),
    ("Kuruluş 2020 & ortaklar.", "kuruluş iki bin yirmi ve ortaklar."),
    ("Hey 😀 bu harika ⭐ oldu.", "hey bu harika oldu."),
    ("**Önemli** not: #gündem", "önemli not: heşteg gündem"),
    ("Sn. Ahmet Bey geldi.", "sayın ahmet bey geldi."),
    ("Hız 100 MB/sn idi.", "hız yüz megabayt bölü saniye idi."),
    ("50TL verdim.", "elli lira verdim."),
    ("Yüzde 20'si gitti.", "yüzde yirmisi gitti."),
    ("2 L su için.", "iki litre su için."),
    ("Bu 1,05 değil 2,75 oldu.", "bu bir virgül sıfır beş değil iki virgül yetmiş beş oldu."),
    ("GPT modeli ve AI çağı.", "gepete modeli ve ai çağı."),
    ("Netflix'te dizi izledim, Spotify'dan müzik dinledim.", "netflix'te dizi izledim, spotifay'dan müzik dinledim."),
    ("Facebook'a girdim, Twitter'da yazdım.", "facebook'a girdim, twitter'da yazdım."),
    ("OK, anlaştık.", "okey, anlaştık."),
    ("Kitap s. 45 sayfasında.", "kitap sayfa kırk beş sayfasında."),
    ("I. Dünya Savaşı çok uzun sürdü.", "birinci dünya savaşı çok uzun sürdü."),
    ("Saat 14.00'te gelin.", "saat on dörtte gelin."),
    ("Dün 3'te geldi, 5'e kadar kaldı.", "dün üçte geldi, beşe kadar kaldı."),
    ("2 + 2 = 4 eder.", "iki artı iki eşittir dört eder."),
    ("Ürün kodu 34KAB123 idi.", "ürün kodu otuz dört ka a be yüz yirmi üç idi."),
    ("İETT otobüsü ve İTÜ öğrencisi.", "ietete otobüsü ve itü öğrencisi."),
    ("Bu Ltd. Şti. bizim.", "bu limited şirketi bizim."),
    ("Ders 8:00 ile 17:30 arası.", "ders sekiz ile on yedi otuz arası."),
    ("Fiyatı 1.250,75 TL'dir.", "fiyatı bin iki yüz elli lira yetmiş beş kuruştur."),
    ("Mehmet II zamanında.", "mehmet iki zamanında."),
];

/// Sentences that hold English or brand words: their reading needs the
/// staged lexicons (CMU dictionary, Turkish word counts, reviewed lexicon).
const NEEDS_LEXICONS: &[&str] = &["iPhone", "YouTube", "ChatGPT", "Instagram", "Netflix", "Facebook", "GPT", "Store", "Intel", "Twitter", "WhatsApp", "LinkedIn", "Spotify"];

#[test]
fn every_sentence_reads_as_the_original_normaliser_reads_it() {
    let staged = super::super::models_dir().join("antalia").join("cmudict.dict").exists();
    let mut wrong = Vec::new();
    for (written, spoken) in READINGS {
        if !staged && NEEDS_LEXICONS.iter().any(|w| written.contains(w)) {
            continue;
        }
        let got = model_text(written);
        if got != *spoken {
            wrong.push(format!("{written}
   want {spoken}
   got  {got}"));
        }
    }
    assert!(wrong.is_empty(), "{} of {} differ:
{}", wrong.len(), READINGS.len(), wrong.join("
"));
}

#[test]
fn numbers_read_in_turkish() {
    assert_eq!(number_to_words(0), "sıfır");
    assert_eq!(number_to_words(1000), "bin");
    assert_eq!(number_to_words(1823), "bin sekiz yüz yirmi üç");
    assert_eq!(number_to_words(2_000_000), "iki milyon");
    assert_eq!(ordinal_words(12), "on ikinci");
    assert_eq!(attach_suffix("otuz", "da"), "otuzda");
    assert_eq!(attach_suffix("dört", "e"), "dörde");
    assert_eq!(attach_suffix("lira", "dir"), "liradır");
}
