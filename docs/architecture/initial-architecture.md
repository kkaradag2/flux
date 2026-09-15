# Başlangıç mimarisi

Bu belge hedef mimariyi tanımlar. Electron Forge, Vite, React ve TypeScript ile main/preload/renderer iskeleti `apps/desktop` altında kurulmuştur. Domain, orchestrator, agent runtime, adapter'lar, SQLite ve IPC kullanım senaryoları henüz uygulanmamıştır.

## Electron modular monolith

Flux tek dağıtım birimine sahip, içeride sorumluluklarına göre modüllere ayrılan bir Electron uygulaması olacaktır. Modüller açık sözleşmeler üzerinden iletişim kurar. İş kuralları core domain'de, kullanım senaryoları orchestrator'da, ürün ve protokol bağımlılıkları adapter'larda tutulur.

## Main, preload ve renderer process sınırları

- **Main:** Uygulama yaşam döngüsünü ve modüllerin bağlantılarını yönetir. Dosya sistemi, SQLite, Git ve agent süreçlerine kontrollü erişim sağlar. IPC handler'ları doğrulama ve kullanım senaryosu çağrısıyla sınırlıdır.
- **Preload:** Renderer'a dar, açıkça tanımlanmış bir API sunar. Ham IPC, dosya sistemi veya genel amaçlı komut çalıştırma yetkisi açmaz.
- **Renderer:** Kullanıcı arayüzü, görünüm durumu ve kullanıcı etkileşimlerini yönetir. Domain kararları vermez; Node.js, SQLite veya agent SDK'larına doğrudan erişmez.

Context isolation etkin, renderer Node integration kapalı olacak şekilde tasarlanır. Main tarafı gelen mesajları ve proje erişim sınırlarını doğrular; uzun süren agent işlemleri arayüzü veya main olay döngüsünü bloke etmemelidir.

## Core domain

Project, branch bağlamı, agent yetenekleri, request, task graph ve run kavramlarını içerir. Task bağımlılıkları, geçerli durum geçişleri ve atama uygunluğu burada tanımlanır. Electron, Mastra, Coldstart, Codex, ACP ve SQLite bağımlılığı taşımaz.

## Orchestrator

İstekten plan üretme, plan inceleme, task atama, bağımlılık sırasıyla yürütme, iptal ve yeniden deneme kullanım senaryolarını koordine eder. Domain kurallarını çağırır; runtime, memory, çalışma alanı ve persistence erişimini port adı verilen uygulama arayüzleri üzerinden gerçekleştirir. Mastra seçilirse ilgili uygulama adapter'ının arkasında kalır; domain modelini belirlemez.

## Agent runtime

Bir agent oturumunu başlatma, task gönderme, olayları izleme, iptal etme ve sonlandırma için ortak sözleşme sağlar. Yetenekler, sonuçlar ve hata durumları Flux'un kendi veri tipleriyle ifade edilir. Zaman aşımı, süreç kapanışı ve iptal sonuçları açıkça raporlanır. Başarısız bir deneme geçmişten silinmez; yeniden deneme ayrı bir yürütme kaydı oluşturur.

## ACP adapters

ACP (Agent Client Protocol) mesajlarını ve oturumlarını ortak agent runtime sözleşmesine çevirir. Protokol sürümü ve sağlayıcı farklılıkları adapter içinde tutulur. Codex'e özgü CLI veya SDK kullanımı da ayrı adapter arkasındadır; ACP desteği var sayılmaz, entegrasyon aşamasında doğrulanır.

## Coldstart memory adapter

Proje bağlamını ve tekrar kullanılabilir geliştirme bilgisini bir memory port üzerinden sağlar. Coldstart'ın veri modeli domain'e sızmaz. Coldstart API'si ve uygunluğu entegrasyon aşamasında doğrulanır. Memory erişimi, SQLite'taki yürütme kayıtlarının yerine geçmez; gerektiğinde başka bir sağlayıcı veya yerel uygulama ile değiştirilebilir.

## Git/worktree adapter

Repo ve branch bilgilerini okuma, yetkilendirilmiş çalışma alanında worktree oluşturma, diff alma ve güvenli temizleme işlemlerini kapsar. Kullanıcının mevcut değişikliklerini korur. Commit ve push yalnızca açık kullanıcı onayıyla yapılır. Bu repo için bütün işlemler `C:\WorkSpace\AI\Flux` altında kalır; başka projelere erişim verilmez.

## SQLite persistence

Proje kayıtlarını, istekleri, task graph'ları, agent atamalarını, run history ve yürütme olaylarını yerel olarak saklar. Repository port'larının SQLite adapter'ı, şema ve migration ayrıntılarının sahibidir. İlişkili durum değişiklikleri transaction içinde kaydedilir. Uygulama yeniden başladığında yarım kalan run'lar uzlaştırılır; task'lar körlemesine yeniden çalıştırılmaz. Veritabanı ve günlükleri kaynak kontrolüne eklenmez.

## IPC contracts

Renderer ile main arasında sürümlenebilir komut, yanıt ve olay sözleşmeleri kullanılır. Mesajlar serileştirilebilir DTO'lardan oluşur; domain nesneleri, SDK tipleri ve veritabanı bağlantıları process sınırını geçmez. Main tarafında girdi doğrulaması ve yetki kontrolü yapılır. Request, task ve run kimlikleri olaylarla sonuçları ilişkilendirir; hatalar tanımlı kodlarla, abonelikler açık yaşam döngüsüyle yönetilir.

## Entegrasyonların değiştirilebilir olması

Bağımlılık yönü dış katmanlardan iç katmanlara doğrudur: UI/IPC kullanım senaryolarını çağırır; orchestrator domain ve port'lara dayanır; adapter'lar port'ları uygular. Main içindeki kurulum noktası somut adapter'ları bağlar. Böylece agent sağlayıcısı, ACP istemcisi, Mastra, Coldstart, Git erişimi veya persistence uygulaması değiştiğinde core domain aynı kalabilir. Her adapter ileride aynı sözleşmeye uygunluk açısından doğrulanır.

TypeScript base yapılandırması ortak dil ve katılık ayarlarını içerir. Desktop paketinde Node ve renderer için ayrı TypeScript yapılandırmaları, main/preload/renderer için ayrı Vite yapılandırmaları kullanılır. Forge geliştirme sunucusunu ve Electron başlatma akışını yönetir.
