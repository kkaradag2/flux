# Organizer planning — main process ve IPC

## Composition ve güvenilir kaynak

`main.ts`, mevcut project, conversation, management ve runtime servislerini `composeOrchestration` üzerinden tek composition noktasına verir. Burada JSON repository, gözlemleyen repository adapter'ı, `MainTeamPromptSource`, mevcut doğrulanmış Codex source/adapter, runtime router, executor, coordinator, read-model publisher ve IPC registration oluşturulur. Recovery bitmeden IPC talepleri kabul edilmez. Application/domain katmanları Electron veya sağlayıcı protokolüne bağlı değildir.

Renderer start için yalnız `conversationId`, `projectId`, `branch`, `teamId`, `message`; continue için yalnız `runId`, `message` gönderir. Fazladan alanlar reddedilir. Proje yolu, üyeler, Organizer, instructions ve runtime ayarları main içindeki kayıtlı servislerden çözülür. Conversation/proje ilişkisi, kayıtlı ve erişilebilir repo, local branch, seçili proje, takım üyeleri ve enabled Organizer doğrulanır. Start branch'i conversation ve kayıtlı proje seçimiyle eşleşmelidir; continuation conversation'ın kayıtlı branch'ini doğrular. Git yalnız okunur; checkout/switch yapılmaz ve HEAD eşleşmesi zorunlu tutulmaz.

## Disk ve geliştirme profili

Orchestration kayıtları `app.getPath('userData')/orchestration` altında kalır. İlk composition'da kayıtlı projeler ve worktree kökü dışlanır; sonradan seçilmiş projeler için de profile'ın proje içinde olmadığı yeniden doğrulanır.

Eski dev profile repo içindeki `.flux/desktop` konumundaydı. Geliştirmede yeni userData `<appData>/Flux/development` olarak ayarlanır. İlk açılışta yalnız Flux'a ait projects/agents/teams/runtime JSON'ları, conversations, agent avatarları ve varsa orchestration kayıtları yeni profile kopyalanır. Eski dosyalar silinmez; mevcut hedef dosyalar ezilmez. Cache, Chromium oturumları, log ve geçici dosyalar taşınmaz. Symlink kayıtlar reddedilir. Tamamlanma işareti tekrarlı taşımayı engeller; yarıda kalan kopyalama sonraki açılışta eksik dosyalardan devam eder. Bu geliştirmede Electron açılmadığından gerçek kullanıcı profili taşınmadı; yalnız izole fixture ile test edildi.

## IPC/preload ve read model

- `getConversationOrchestration(conversationId)`
- `startTeamPrompt(request)`
- `continueTeamPrompt(request)`
- `subscribeToOrchestrationChanges(listener)` → unsubscribe

Preload genel send/invoke API'si açmaz. Main handler yalnız trusted webContents'in main frame taleplerini kabul eder. Hatalar sabit allowlist kod ve mesajlarına dönüştürülür; exception message veya stack kopyalanmaz.

Read model açık alan projeksiyonudur: run özeti, plan özeti ve plan sırasındaki tasklar. Tarihler ISO string, task durumları typed union'dır. Internal session, path, executable, instruction, ham output ve domain event payload'ı taşınmaz. Agent adı mevcut kayıtlı tanımdan alınır; bulunamazsa nötr bir fallback kullanılır. Şimdilik yalnız builtin avatar adı gönderilir; image avatar alanı boş bırakılır.

## Bildirimler ve lifecycle

`ObservedOrchestrationRepository` yalnız başarılı atomik yazmadan sonra read model yayınlar. Planning creation, session kaydı, waiting input, plan/tasks ve terminal durumlar yayınlanır. Bildirim hatası başarılı disk kaydını geri almaz. Publisher sırayla çalışır, dinleyiciler birbirlerinden yalıtılır. Preload aynı callback'i ikinci kez eklemez; son unsubscribe main publisher aboneliğini kaldırır.

Pencere kapanışı, renderer crash veya ana frame navigation listener'ları temizler ve o pencerenin aktif planlamasını iptal eder. Bekleyen continuation lookup kapanıştan sonra yeni model çağrısı başlatamaz. App shutdown IPC kaydını kaldırır, aktif işlemleri iptal eder ve cleanup'ı bekler. Composer, chat ve Tasks/Team bileşenleri bu API'ye bağlanmadı.

## Recovery

Startup'ta `listAllRuns` yalnız orchestration klasörünü okur. Önceki process'ten kalan planning run'ları merkezi transition API'siyle atomik failed yapılır. `run.failed.reason` sabit `PLANNING_INTERRUPTED` kodudur. Session korunur; goal, kullanıcı cevabı ve ham runtime hata metni failure event'ine kopyalanmaz. Waiting input, running/tasklar ve terminal kayıtlar değişmez. İkinci recovery yeni event üretmez; model çağrısı veya otomatik retry yapılmaz.

Bozuk/okunamayan recovery kaydı orchestration modülünü güvenli biçimde devre dışı bırakır; talepler `ORCHESTRATION_FAILED` döner. Diğer ekranların composition'ı devam eder. Bu aşamada bozuk kayıt onarımı veya Retry UI'ı yoktur.

## Doğrulama

- Yeni `orchestration-main.test.cjs`: **32 test başarılı** (üst test dahil).
- İlgili project, management, conversation, single-agent ve runtime regresyonlarıyla birlikte: **172 test başarılı**.
- Domain, orchestration persistence ve coordinator: ayrıca **82 test başarılı**; toplam **254 farklı focused test**, başarısız yok.
- `pnpm typecheck`: başarılı.
- `git diff --check`: başarılı.
- Gerçek model, Electron, build/package veya görsel test çalıştırılmadı. Yeni bağımlılık, commit veya push yok.

## Bu aşamada değişen dosyalar

Yeni:

- `apps/desktop/src/application/orchestration/recoverPlanningRuns.ts`
- `apps/desktop/src/main/orchestration/composeOrchestration.ts`
- `apps/desktop/src/main/orchestration/MainTeamPromptSource.ts`
- `apps/desktop/src/main/orchestration/ObservedOrchestrationRepository.ts`
- `apps/desktop/src/main/orchestration/OrchestrationViews.ts`
- `apps/desktop/src/main/orchestration/OrchestrationService.ts`
- `apps/desktop/src/main/orchestration/OrchestrationBoundaryError.ts`
- `apps/desktop/src/main/orchestration/registerOrchestrationIpc.ts`
- `apps/desktop/src/main/persistence/developmentProfile.ts`
- `apps/desktop/src/shared/orchestration-api.ts`
- `apps/desktop/src/shared/orchestration-channels.ts`
- `apps/desktop/src/preload/orchestrationApi.ts`
- `apps/desktop/tests/orchestration-main.test.cjs`
- Bu mimari belge.

Güncellenen:

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/application/orchestration/OrchestrationRepository.ts`
- `apps/desktop/src/main/orchestration/JsonOrchestrationRepository.ts`
- `apps/desktop/src/main/projects/ProjectRepository.ts`
- `apps/desktop/src/main/projects/ProjectService.ts`
- `apps/desktop/src/shared/project-api.ts`
- `apps/desktop/src/preload/preload.ts`

Önceki aşamanın commit edilmemiş coordinator/domain/runtime değişiklikleri korundu.

## Açık noktalar

Renderer entegrasyonu sonraki aşamadadır. Conversation'ın önceden mevcut olması gerekir; bu API boş conversation oluşturmaz. Image avatar dönüşümü, Retry, plan revision, worker/scheduler ve gerçek Claude adapter kapsam dışıdır. Kilitler main process içindedir; aynı userData ile birden fazla bağımsız process çalıştırmak için process'ler arası koordinasyon eklenmedi. Production profil taşıması yoktur; değişiklik yalnız eski development profile'a uygulanır.
