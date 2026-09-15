# Flux

Flux, yazılım geliştirme isteklerini task'lara ayıran, uygun coding agent'lara atayan ve yürütme akışını masaüstünden izlemeyi sağlayan local-first bir multi-agent geliştirme uygulamasıdır.

## Durum: Gerçek proje ve local branch seçimi

`apps/desktop` altında Electron Forge + Vite + React + TypeScript uygulaması bulunur. Sistem temasını izleyen mevcut tasarım korunur. Sidebar geniş ekranda 280 px, daraltıldığında 64 px olur; proje geçmişi açılıp kapanır. Project selector kayıtlı Git projelerini, Branch selector seçili projenin local branch listesini gösterir. Local alanı sabittir.

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
- `apps/desktop/src/preload/`: typed window.flux API; renderer kanal adlarını bilmez.
- `apps/desktop/src/renderer/`: React arayüzü ve stiller.
- `apps/desktop/src/renderer/components/`: workspace, sidebar, chat ve composer bileşenleri; ortak UI parçaları `shared/` altında tutulur.
- `apps/desktop/src/renderer/data/workspace-preview.ts`: örnek proje ve konuşma kayıtları.
- `apps/desktop/vite.*.config.mts`: main, preload ve renderer için ayrı Vite yapılandırmaları.

Renderer `contextIsolation=true`, `nodeIntegration=false` ve `sandbox=true` ile çalışır. Node ve renderer TypeScript kontrolleri ayrı yapılır. React Refresh için yalnızca geliştirme sunucusunda CSP inline script izni eklenir; paketlenen HTML bu izni içermez.

UI bileşenleri veri ve callback prop'ları kabul eder. `WorkspaceContext` kullanıcı mesajlarını, seçimleri ve New task sıfırlama akışını yönetir. `useSidebar` sidebar state'ini tutar; takım özeti kalıcı agent/team kayıtlarından render edilir. Prompt kendi metnini yönetir; 54–180 px arasında büyür, sonra kendi içinde kayar. Enter gönderir, Shift+Enter yeni satır ekler; boş metin gönderilmez. Yalnızca kullanıcı mesajı gösterilir ve son mesaja kaydırılır. New task mesajları ve taslak metni temizleyip prompt'a focus verir; ekip ve seçimler korunur. Mesajlar oturum içindedir. Proje ve branch seçimleri main process üzerinden kalıcı kaydedilir. Markdown preview bağımlılıkları aşağıda açıklanmıştır.

## Doğrulanan araçlar

15 Eylül 2026 tarihinde mevcut ortamda Node.js `v24.19.0`, npm `11.17.0`, pnpm `9.15.9`, Git `2.47.1.windows.1` ve Codex CLI `0.151.0` doğrulandı. Bunlar test edilen ortam sürümleridir; gelecekteki bağımlılıklar için uyumluluk garantisi değildir.

Çalışma sınırı `C:\WorkSpace\AI\Flux` dizinidir. Sonraki aşamaya yalnızca kullanıcı talebiyle geçilir.

## Workspace takım özeti

TeamPanel seçili team'in sıralı üyelerini ortak avatar bileşeniyle gösterir. Birden fazla team olduğunda takım seçimi açılır. Enabled üyeler Idle, diğerleri Disabled görünür. Panelde edit işlemi ve gerçek agent yürütme yoktur.
## Proje kaydı ve Git sınırı

`ProjectService` seçim ve yetkilendirmeyi, `GitRepositoryService` salt okunur Git komutlarını, `ProjectRepository` atomik JSON yazımını yönetir. `userData/projects.json` kayıtlı projeleri ve son aktif projeyi korur; geliştirmede bu dosya `.flux/desktop/projects.json` konumundadır. Kayıt boşsa yalnızca Flux reposu eklenir.

`window.flux` API: `selectProjectDirectory`, `addProject`, `getProjects`, `getGitBranches`, `getCurrentBranch`, `selectWorkspace`. Yeni yollar yalnızca native folder picker sonucu yetkilendirilir. Aynı canonical yol tekrar eklenmez. Remote branch listelenmez. Branch seçimi kayıtlı UI tercihini değiştirir; Git HEAD ve çalışma dosyaları değişmez. Yeniden açılışta kayıtlı seçim korunur; artık bulunmayan branch için mevcut branch veya ilk local branch kullanılır.

Servis doğrulaması: `node --test apps/desktop/tests/project-services.test.cjs`. Test repo ve kayıtları yalnızca `.cache/project-service-tests` altında oluşturulur; yeni commit üretilmez.

## Kalıcı Agents / Teams yönetimi

Agents alanında Agents ve Teams tab'ları, ayrı liste/create/edit ekranları bulunur. Form taslakları kayıtlı state'ten ayrıdır; kaydedilmemiş değişikliklerde uygulama içi dialog gösterilir. `agents.json` ve `teams.json` Electron userData altında tutulur. Eksik, boş dosya veya boş dizi ilk veriyi oluşturur; parse hatası mevcut dosyayı korur. Yazımlar geçici dosya + rename ile yapılır. Main doğrulaması ID/tarih değiştirmeyi, geçersiz runtime/effort ve team üyeliklerini reddeder.

Avatarlar `agent-avatars` altında güvenli asset ID ile tutulur. PNG/JPEG/WebP, en fazla 2 MB ve 4096 × 4096 boyut kabul edilir; decode ve dosya imzası main içinde doğrulanır. Renderer yalnızca doğrulanmış data URL alır. Markdown preview için `react-markdown` + `remark-gfm` kullanılır. Ham HTML atlanır; preview bağlantıları veya görselleri dış kaynak açmaz.

Workspace paneli kalıcı agent/team kayıtlarından beslenir; Disabled üyeler görünür kalır. Seçili team WorkspaceContext içinde oturumluk tutulur. Gerçek agent çalıştırma veya request kaydı yoktur.

Doğrulama komutları: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm package`. Build yalnızca main/preload/renderer üretir; package Forge ile uygulama klasörü üretir. Repository/service testleri `.cache` altında izole dosyalar kullanır.

## Codex runtime sağlık kontrolü

Settings → Runtimes ekranı Codex CLI kurulum, sürüm ve authentication durumunu gösterir. RuntimeCommandRunner yalnızca PATH üzerindeki adlandırılmış executable adaylarını kontrol eder. Version için 5 saniye, login status için 10 saniye sınırı kullanılır. Windows .cmd adapter'ı sabit argümanlarla ve shell:false ile çalışır; timeout'ta taskkill /t /f alt süreçleri de durdurur. macOS/Linux tarafında executable doğrudan çalıştırılır ve timeout'ta süreç grubu sonlandırılır.

CodexRuntimeProbe yalnızca doğrulanmış sürüm ve sabit ChatGPT/API key etiketlerini döndürür. Ham stdout/stderr, executable yolu ve credential içeriği renderer'a gönderilmez veya dosyaya yazılmaz. Auth dosyaları uygulama tarafından açılmaz. RuntimeHealthService eşzamanlı çağrıları birleştirir ve son sonucu bellekte tutar; Refresh yeni kontrol başlatır. Health sorumluluğu agent/workspace state'inden ayrıdır. Prompt/agent çalıştırma, install/login/logout işlemi eklenmemiştir.
