# Flux

Flux, yazılım geliştirme isteklerini task'lara ayıran, uygun coding agent'lara atayan ve yürütme akışını masaüstünden izlemeyi sağlayan local-first bir multi-agent geliştirme uygulamasıdır.

## Durum: Ana çalışma ekranı React etkileşimleri

`apps/desktop` altında Electron Forge + Vite + React + TypeScript uygulaması bulunur. Sistem temasını izleyen mevcut tasarım korunur. Sidebar geniş ekranda 280 px, daraltıldığında 64 px olur; proje geçmişi açılıp kapanır. Flux, Local ve main içeren selector'lar statik seçenek menülerini açar. Gerçek entegrasyon yoktur.

## Geliştirme

Repo kökünde Node.js 24 ve pnpm 9.15.9 kullanın:

```powershell
$env:ELECTRON_CACHE = "$PWD\.cache\electron"
$env:TEMP = "$PWD\.cache\tmp"
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
pnpm install --frozen-lockfile
pnpm typecheck
pnpm start
```

Electron ilk çalıştırmada kendi binary dosyasını indirebilir. `.npmrc`, pnpm store/cache konumlarını repo içinde tutar ve Forge için `node-linker=hoisted` kullanır. Geliştirme sırasında Electron profili `.flux/desktop` altında saklanır.

`pnpm package`, Forge üzerinden yerel platform uygulama klasörü üretir; çıktı `apps/desktop/out` altındadır. Bu aşamada installer maker veya yayınlama akışı yoktur.

## Belgeler

- [Çalışma kuralları](AGENTS.md)
- [Ürün kapsamı](docs/architecture/product-scope.md)
- [Başlangıç mimarisi](docs/architecture/initial-architecture.md)

## Repo düzeni

- `docs/architecture/`: ürün ve mimari kararları.
- `package.json`: yayınlanmayan özel workspace kökü.
- `pnpm-workspace.yaml`: `apps/*` ve gelecekteki `packages/*` workspace alanları.
- `tsconfig.base.json`: ortak TypeScript ayarları.
- `apps/desktop/src/main/`: pencere ve Electron yaşam döngüsü.
- `apps/desktop/src/preload/`: ayrı preload giriş noktası; henüz renderer'a API açılmaz.
- `apps/desktop/src/renderer/`: React arayüzü ve stiller.
- `apps/desktop/src/renderer/components/`: workspace, sidebar, chat ve composer bileşenleri; ortak UI parçaları `shared/` altında tutulur.
- `apps/desktop/src/renderer/data/workspace-preview.ts`: örnek proje ve konuşma kayıtları.
- `apps/desktop/vite.*.config.mts`: main, preload ve renderer için ayrı Vite yapılandırmaları.

Renderer `contextIsolation=true`, `nodeIntegration=false` ve `sandbox=true` ile çalışır. Node ve renderer TypeScript kontrolleri ayrı yapılır. React Refresh için yalnızca geliştirme sunucusunda CSP inline script izni eklenir; paketlenen HTML bu izni içermez.

UI bileşenleri veri ve callback prop'ları kabul eder. `WorkspaceContext` kullanıcı mesajlarını, seçimleri ve New task sıfırlama akışını yönetir. `useSidebar` sidebar state'ini tutar; takım özeti statik typed veriden render edilir. Prompt kendi metnini yönetir; 54–180 px arasında büyür, sonra kendi içinde kayar. Enter gönderir, Shift+Enter yeni satır ekler; boş metin gönderilmez. Yalnızca kullanıcı mesajı gösterilir ve son mesaja kaydırılır. New task mesajları ve taslak metni temizleyip prompt'a focus verir; ekip ve seçimler korunur. Bütün state oturum içindedir. IPC ve ek bağımlılık yoktur.

## Doğrulanan araçlar

15 Eylül 2026 tarihinde mevcut ortamda Node.js `v24.19.0`, npm `11.17.0`, pnpm `9.15.9`, Git `2.47.1.windows.1` ve Codex CLI `0.151.0` doğrulandı. Bunlar test edilen ortam sürümleridir; gelecekteki bağımlılıklar için uyumluluk garantisi değildir.

Çalışma sınırı `C:\WorkSpace\AI\Flux` dizinidir. Sonraki aşamaya yalnızca kullanıcı talebiyle geçilir.

## Core Team özeti

TeamPanel, data/core-team.ts içindeki typed diziyi TeamMemberRow bileşenleriyle gösterir. Lead, Developer, Reviewer ve Tester üyelerinin runtime değeri Codex olarak tanımlıdır. Panel yalnızca takım adı, 4 agents bilgisi ve kompakt üye satırlarını içerir; buton, menü veya empty state yoktur. Üye satırlarında typed status alanına göre Idle / Working gösterilir; runtime entegrasyonu olmadığı için başlangıç verileri Idle durumundadır. Prompt toolbar yalnızca Flux, Local ve main seçimlerini içerir. Runtime prompt ayarı değildir. Gerçek agent bağlantısı veya yürütme yoktur.
