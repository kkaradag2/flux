# Ürün kapsamı

## Çözülen problem

Birden fazla coding agent ile geliştirme yaparken istekleri parçalamak, bağımlılıkları sıralamak, agent atamalarını yönetmek ve sonuçları takip etmek farklı araçlara dağılır. Flux bu süreci tek masaüstü arayüzünde görünür ve izlenebilir hale getirir.

## Hedef kullanıcı

Yerel Git projelerinde çalışan, coding agent'larla birden fazla geliştirme işini yönetmek isteyen yazılımcılar ve teknik proje sahipleri.

## Temel kullanıcı akışı

1. Kullanıcı izin verdiği yerel projeyi ve çalışılacak branch'i seçer.
2. Yazılım geliştirme isteğini girer.
3. Sistem isteği bağımlılıkları olan bir task graph'a dönüştürür; kullanıcı planı inceler.
4. Task'lar yeteneklerine ve kullanılabilirliklerine göre uygun agent'lara atanır.
5. Sistem bağımlılık sırasını gözeterek task'ları yürütür; kullanıcı durumları, olayları ve çıktıları izler.
6. Kullanıcı sonuçları ve kod değişikliklerini inceler; başarısız işleri yeniden deneyebilir veya yürütmeyi iptal edebilir.
7. Run history, planı ve yürütme sonuçlarını sonraki incelemeler için saklar. Commit ve push açık kullanıcı onayı gerektirir.

## MVP kapsamı

- Yerel proje ve branch seçimi.
- İstek oluşturma, task graph üretimi ve plan inceleme.
- Agent yeteneklerinin kaydı ve task ataması.
- Bağımlılıklara göre yürütme, durum takibi, iptal ve yeniden deneme.
- Önce tek çalışan adapter ile uçtan uca akış; farklı agent'ları destekleyen ortak sözleşmeler.
- Git/worktree ile çalışma alanı ayrımı ve değişikliklerin incelenmesi.
- Yerel SQLite üzerinde istekler, task'lar ve run history.
- Tek Electron uygulamasında plan, ilerleme, hata ve çıktı görünümü.

Bu maddeler hedef MVP'yi tanımlar; Phase 0'da hiçbiri uygulanmaz.

## MVP dışında kalanlar

- Bulut orkestrasyonu, uzak worker filosu ve ayrı sunucu dağıtımı.
- Eş zamanlı ekip düzenleme, hesap yönetimi ve bulut senkronizasyonu.
- Agent pazaryeri, faturalandırma ve kapsamlı eklenti ekosistemi.
- Otomatik onaysız commit, push, merge veya ürün deploy'u.
- Tüm agent sağlayıcılarıyla ilk günden entegrasyon.

## Local-first yaklaşımı

Proje dosyaları ve uygulama geçmişi varsayılan olarak kullanıcının cihazında tutulur. Yerel durumun görüntülenmesi ayrı bir backend gerektirmez. Seçilen agent sağlayıcısı ağ bağlantısına ihtiyaç duyabilir; local-first, bütün agent işlemlerinin çevrimdışı çalışacağı anlamına gelmez. Dış servise gönderilecek bağlam, kullanıcı tarafından yetkilendirilmiş proje ve iş kapsamıyla sınırlanır.

## Tek deploy edilen Electron desktop uygulaması

Ürün tek bir Electron masaüstü uygulaması olarak paketlenir ve dağıtılır. Main, preload ve renderer aynı ürünün parçalarıdır; bağımsız dağıtılan servisler değildir. Agent süreçleri gerektiğinde yerel alt süreçler olarak çalışabilir; harici CLI gereksinimleri adapter bazında açıkça belirtilir.

## Temel kavramlar

| Kavram | Anlamı |
| --- | --- |
| Project (proje) | Kullanıcının yetkilendirdiği yerel repo ve Flux içindeki proje kaydı. |
| Branch | Git üzerinde geliştirme bağlamını belirleyen dal; worktree ile ilişkilendirilebilir. |
| Agent | Yetenekleri ve çalışma durumu bilinen, bir runtime adapter üzerinden erişilen coding agent. |
| Request (istek) | Kullanıcının hedefini, kapsamını ve kabul ölçütlerini içeren geliştirme talebi. |
| Task graph | İsteği gerçekleştiren task'ların ve aralarındaki bağımlılıkların döngüsüz yönlü grafiği. |
| Run history | Bir yürütme denemesinin atamalarını, durum geçişlerini, zamanlarını, olaylarını ve sonuçlarını saklayan geçmiş. |
