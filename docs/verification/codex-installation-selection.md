# Phase 1C — Codex kurulum seçimi

## Uygulanan değişiklik

Birden fazla doğrulanmış Codex kurulumu ve kalıcı kullanıcı seçimi yoksa `INSTALLATION_SELECTION_REQUIRED` üretilir. Settings yalnız **Setup required / Choose installation** gösterir. Seçim ekranı varsayılan radio seçmez. Aday listesi main process'tedir; renderer sadece allowlist candidate ID gönderir.

Kalıcı seçim ayrı repository içindedir. Version/auth kontrolleri, App Server ve protocol schema üretim helper'ı aynı bound RuntimeCommandRunner resolver'ını kullanır. Önceki doğrulama cache anahtarına kurulum kimliği eklenmiştir. Seçim kaybolunca PATH'in ilk adayına dönülmez. Geçersiz referans, yeniden açılışta sessiz fallback'i önlemek için diskte tutulur ancak hiçbir işlemde çalıştırılmaz; yeni açık seçimle değiştirilir.

Npm güncellemesi yalnız seçilen kuruluma ait doğrulanmış prefix'e yönelir. Npm JS entry point'i Node ile `shell:false` çalışır; prefix ayrı argv öğesidir. Sabit paket `@openai/codex@latest` kullanılır. Standalone/unknown kurulum otomatik güncellenmez. Diğer kurulum silinmez, PATH/auth/config değiştirilmez.

## Gerçek ortamda doğrulananlar

15 Eylül 2026:

- Aday 1: **npm 0.151.0**, First on PATH, güncellenebilir.
- Aday 2: **standalone 0.154.0-alpha.6.2**, otomatik güncellenemez.
- Npm registry `latest`: **0.154.0**.
- Electron açıldı. Settings `Setup required` gösteriyor.
- Update Codex ve Check again bu durumda görünmüyor.
- Yerel dialog iki sürümü/kurulum yöntemini gösteriyor; hiçbir radio seçili değil.
- Use this installation, kullanıcı seçim yapmadan disabled.
- Gerçek executable yolları rapora/loglara alınmadı. Dialog ekran görüntüsü bu nedenle rapora eklenmedi.

## Bekleyen gerçek doğrulama

Talepteki açık kullanıcı seçimi kuralı gereği **kurulum seçimi bekleniyor**. Otomatik olarak bir aday seçilmedi. Bu nedenle şu adımlar henüz gerçek makinede çalıştırılmadı:

- Seçimin gerçek Electron ekran geçişi ve yeniden açılışında korunması.
- Seçilen npm kurulumunun gerçek Update Codex ile güncellenmesi.
- Diğer gerçek executable'ın hash/sürümünün değişmediğinin karşılaştırılması.
- Yeni seçili sürümden schema üretimi ve otomatik gerçek `Hello from Flux.` yanıtı.
- Son gerçek `Ready to use` görünümü.

Bu akışların test doubles ile doğrulanması gerçek güncelleme/model başarısı anlamına gelmez. Gerçek seçim alındıktan sonra kalan adımlar yürütülmelidir.

## Otomatik doğrulamalar

- `pnpm test`: **77 geçti, 0 başarısız**; mevcut 61 test korundu.
- `pnpm typecheck`: başarılı.
- `pnpm build`: başarılı.
- `pnpm package`: Windows x64 başarılı.
- `git diff --check`: başarılı.

Yeni testler tek/çoklu aday, no-default-selection, geçersiz ID/path/object engeli, artık var olmayan aday, kalıcı seçim, PATH sırası değişimi, seçili dosyanın PATH dışına çıkması, silinen/geçersiz seçimin fallback yapmaması, health/App Server ortak executable kaynağı, yanlış hello ile Ready olamama, standalone güncelleme engeli, npm owning-prefix ilişkisi ve hedeflenmiş güncellemeyi kapsar. Boşluk, `&` ve `%` içeren prefix'in gerçek bir Node fixture process'ine tek argv öğesi olarak aktarıldığı doğrulandı. Eski process/timeout/cancellation/cleanup testleri korunur.

## Eklenen dosyalar

- `apps/desktop/src/shared/codex-installation.ts`
- `apps/desktop/src/main/runtime/CodexInstallationRepository.ts`
- `apps/desktop/src/main/runtime/CodexInstallationService.ts`
- `apps/desktop/src/main/runtime/NpmInstallationInspector.ts`
- `apps/desktop/src/renderer/components/settings/CodexInstallationDialog.tsx`
- `apps/desktop/tests/installation-selection.test.cjs`
- `docs/verification/codex-installation-selection.md`

## Değiştirilen dosyalar

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/runtime/RuntimeCommandRunner.ts`
- `apps/desktop/src/main/runtime/CodexRuntimeProbe.ts`
- `apps/desktop/src/main/runtime/CodexRuntimeStateRepository.ts`
- `apps/desktop/src/main/runtime/CodexRuntimeStateService.ts`
- `apps/desktop/src/main/runtime/CodexUpdateService.ts`
- `apps/desktop/src/main/runtime/registerRuntimeStateIpc.ts`
- `apps/desktop/src/shared/codex-runtime-state.ts`
- `apps/desktop/src/shared/runtime-state-channels.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/hooks/useCodexRuntimeState.ts`
- `apps/desktop/src/renderer/components/settings/runtimePresentation.ts`
- `apps/desktop/src/renderer/components/settings/CodexRuntimeRow.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsScreen.tsx`
- `apps/desktop/src/renderer/styles.css`
- `AGENTS.md`
- `README.md`

Yeni bağımlılık, commit/push, workspace composer veya agent yürütmesi eklenmedi. macOS/Linux gerçek kurulumları bu Windows ortamında çalıştırılmadı.
