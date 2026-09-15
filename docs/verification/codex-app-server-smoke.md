# Phase 1A — Codex App Server smoke test

## Gerçek sonuç

15 Eylül 2026 tarihinde Electron Settings ekranındaki Run test üzerinden çalıştırıldı.

- Codex CLI: `0.151.0`.
- Authentication: ChatGPT.
- Sonuç: **failed**, `RUNTIME_INCOMPATIBLE`.
- Süre: **5,42 saniye**.
- Ekrandaki zaman: `9/15/2026, 2:16:37 PM`.
- Güvenli mesaj: “The default model requires a newer Codex CLI. Update Codex and try again.”
- initialize, initialized, thread/start ve turn/start akışı çalıştı. Sunucu, varsayılan `gpt-6-astra` modeli için daha yeni Codex sürümü istedi. Gerçek `Hello from Flux.` yanıtı alınamadı; gerçek model doğrulaması henüz başarılı değildir.
- Model, reasoning effort, global Codex ayarları veya CLI kurulumu değiştirilmedi.

## Uygulama

Protokol Electron main process içinde, mevcut RuntimeCommandRunner ve WindowsShimAdapter üzerinden çalışır. Varsayılan stdio JSONL, request ID eşleme, parçalı stdout çözümleme ve minimum runtime guard uygulanır. Oluşturulan protokol şeması yalnızca `.cache/app-server-schema` altında tutulur.

Test yalnızca sabit hello prompt'unu gönderir. Ephemeral thread, never approval, read-only sandbox ve kapalı sandbox network erişimi kullanılır. Model/effort override edilmez. Çalışma dizini yalnızca `C:\WorkSpace\AI\Flux` olarak sabittir. Beklenmedik approval isteği reddedilir; araç isteği testi başarısız kılar. Test bütçesi 43 saniye, süreç ağacı temizliği için ayrılan süre 2 saniyedir.

Eşzamanlı çağrılar aynı çalışmayı paylaşır. Pencere kapanması/uygulama çıkışı iptal ve temizliği tetikler. Renderer'a yalnızca sabit hata kodları, güvenli mesajlar ve başarılı durumda beklenen hello metni döner; ham process çıktısı gönderilmez.

Settings Run test ve health Refresh state'leri ayrıdır. Workspace composer, agents ve teams yürütmeye bağlanmamıştır. Yeni bağımlılık eklenmedi.

## Doğrulamalar

- `codex app-server --help`: kontrol edildi.
- `codex app-server generate-ts --out C:\WorkSpace\AI\Flux\.cache\app-server-schema`: kurulu sürümün tipleri incelendi; ephemeral desteği doğrulandı.
- `pnpm test`: **40 geçti, 0 başarısız**; mevcut 24 test korundu.
- `pnpm typecheck`: başarılı.
- `pnpm build`: başarılı.
- `pnpm package`: Windows x64 paketi başarılı.
- `git diff --check`: başarılı.
- Electron Settings navigation, Ready koşulu, Testing… disabled durumu ve güvenli hata sonucu doğrulandı.
- Gerçek çağrı öncesi/sonrası `git status --porcelain=v1 -uall`, binary diff ve untracked dosya hash'leri aynı kaldı.
- Gerçek çağrı sonunda Flux süreç ağacında yalnızca Electron süreçleri kaldı; Codex/shim child process'i kalmadı. Mock testlerde listener ve stream temizliği doğrulandı.

Testler; handshake sırası, response ID eşleme, parçalı UTF-8/çoklu JSONL, doğru/yanlış final cevap, failed turn, malformed JSON, erken process exit, timeout, cancellation, approval decline yarışı, eşzamanlılık, cleanup ve hassas çıktıların sızmamasını kapsar.

Ekran görüntüsü: `C:\WorkSpace\AI\Flux\.cache\codex-smoke-test.png`.

## Eklenen dosyalar

- `apps/desktop/src/main/app-server/contracts.ts`
- `apps/desktop/src/main/app-server/CodexAppServerTransport.ts`
- `apps/desktop/src/main/app-server/CodexAppServerClient.ts`
- `apps/desktop/src/main/app-server/CodexSmokeTestService.ts`
- `apps/desktop/src/main/app-server/registerSmokeTestIpc.ts`
- `apps/desktop/src/shared/codex-smoke-test.ts`
- `apps/desktop/src/shared/smoke-test-channel.ts`
- `apps/desktop/src/renderer/hooks/useCodexSmokeTest.ts`
- `apps/desktop/src/renderer/components/settings/CodexSmokeTestResultView.tsx`
- `apps/desktop/tests/app-server-smoke.test.cjs`
- `docs/verification/codex-app-server-smoke.md`

## Değiştirilen dosyalar

- `AGENTS.md`
- `README.md`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/runtime/RuntimeCommandRunner.ts`
- `apps/desktop/src/main/runtime/WindowsShimAdapter.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/project-api.ts`
- `apps/desktop/src/renderer/components/settings/CodexRuntimeRow.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsScreen.tsx`
- `apps/desktop/src/renderer/styles.css`

## Bilinen sınırlamalar

Gerçek başarılı hello yanıtı, mevcut varsayılan model/CLI sürüm uyumsuzluğu giderildikten sonra tekrar doğrulanmalıdır. Mock başarı senaryosu gerçek model başarısı olarak değerlendirilmez. Ephemeral desteği kurulu sürümün sözleşmesine dayanır; eski sürümler için archive fallback eklenmemiştir. Bu çalışma tek sabit testtir; genel prompt veya agent çalıştırma API'si değildir.

Commit veya push yapılmadı; sonraki aşamaya geçilmedi.
