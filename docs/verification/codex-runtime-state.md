# Phase 1B — Kalıcı Codex durumu ve kontrollü güncelleme

## Sonuç

15 Eylül 2026: Electron'da **Codex 0.151.0 / ChatGPT / Update required** doğrulandı. Gerçek doğrulama `CLI_TOO_OLD` ile başarısız oldu. Artık kurulum/auth kontrolü tek başına Ready göstermez.

Gerçek Update Codex → Update onayı çalıştırıldı. PATH üzerinde npm global Codex ve Codex desktop executable'ı birlikte bulunduğu için **MULTIPLE_INSTALLATIONS** sonucu üretildi ve npm güncelleme komutu başlatılmadı. Bu, talebin “birden fazla Codex kurulumu varsa otomatik güncelleme yapma” sınırının uygulanmasıdır. CLI sürümü 0.151.0 olarak kaldı. Gerçek güncelleme sonrası yeni sürüm ve `Hello from Flux.` başarısı **henüz doğrulanamadı**.

## Gerçek Electron doğrulamaları

- İlk otomatik kontrol: `UPDATE_REQUIRED`, typed reason `CLI_TOO_OLD`.
- İlk doğrulama zamanı: `2026-09-15T11:37:58.135Z`.
- Settings → New task → Settings geçişinde aynı durum ve `verifiedAt` korundu.
- Electron kapatılıp yeniden açıldı; aynı `verifiedAt` geri yüklendi. Yeniden model çağrısı yapılmadı.
- Refresh ve Run test butonları yok. Update Codex birincil, Check again ikincil eylem.
- Update onay penceresi sürümü ve açıklamayı gösterdi. Cancel herhangi bir güncelleme yapmadı.
- Update onayı çoklu kurulum sebebiyle güvenli manuel yönlendirme gösterdi; auth/config/CLI kurulumu değiştirilmedi.
- Check again gerçek hafif kontrol ve model doğrulamasını tekrar yaptı. Kontrol sırasında eylemler disabled kaldı; son doğrulama zamanı `2026-09-15T11:43:03.911Z` oldu. Sonuç yine `CLI_TOO_OLD`.
- Son durum kaydında `UPDATE_REQUIRED` ve `MULTIPLE_INSTALLATIONS` korundu. Aynı anda Ready ve Update required gösterilmedi.
- Test/güncelleme denemesi öncesi ve sonrası Git status, binary diff ve untracked kaynak dosyası hash'leri aynı kaldı. Uygulamanın amaçlanan `.flux/desktop/codex-runtime-state.json` kaydı güncellendi.

## Otomatik doğrulamalar

- `pnpm test`: **61 geçti, 0 başarısız**; önceki 40 test korundu.
- `pnpm typecheck`: başarılı.
- `pnpm build`: başarılı.
- `pnpm package`: Windows x64 başarılı.
- `git diff --check`: başarılı.

Yeni testler ilk otomatik doğrulama, ekran/restart cache kullanımı, başarılı ve başarısız kalıcılık, sürüm/auth değişimi, executable kaybı, açık retry, eşzamanlılık, typed hata eşleme, contextual eylemler, güncelleme sonrası invalidate → health → verification sırası, başarısız/aynı sürümlü güncelleme, çoklu/bilinmeyen kurulum engeli, sabit npm komutu, güvenli veri kaydı ve listener temizliğini kapsar. Başarılı güncelleme/Ready yolu stub ile doğrulandı; bu gerçek makinede başarılı güncelleme iddiası değildir.

## Mimari ve sınırlar

- Main process'te tek CodexRuntimeStateService, hafif kontrol, sabit hello doğrulaması ve güncellemeyi sırayla yürütür; eşzamanlı çağrılar aynı promise'i paylaşır.
- CodexRuntimeStateRepository app data JSON dosyasına yalnız allowlist alanlarını atomik yazar. Ham çıktı, executable yolu veya credential kaydedilmez. Bozuk kayıt korunur ve güvenli hata gösterilir.
- Cache yalnız aynı CLI version/auth yöntemi için kullanılır. Explicit Check again/Try again yeni doğrulama başlatır. Güncelleme sonrası aynı sürüm bulunursa Ready gösterilmez.
- `RUNTIME_INCOMPATIBLE` tek başına güncelleme gerekçesi değildir. Yalnız `CLI_TOO_OLD` bu eylemi üretir.
- Güncelleme yalnız tek npm global kurulumun metadata/shim eşleşmesi doğrulanırsa sabit `npm install -g @openai/codex@latest` komutunu çalıştırır. `shell:false`, Windows shim metakarakter engeli, gizli subprocess, 180 saniye timeout ve uygulama kapanışında cleanup kullanılır. Yetki yükseltme yoktur.
- UI ayrı hook kullanır; main snapshot'larını okur. Renderer localStorage veya process/protokol erişimi kullanmaz.
- Geçerli doğrulama cache'i model/config değişikliklerini ayrıca izlemez; bu aşamanın geçersizleştirme anahtarları CLI sürümü ve auth yöntemidir.
- Otomatik güncellemenin gerçek Windows başarı yolu ve macOS/Linux kurulumu bu makinede çalıştırılmadı.
- Workspace composer, agents, teams ve çoklu agent yürütmesi değiştirilmedi. Yeni bağımlılık, commit veya push yok.

## Bu aşamada eklenen dosyalar

- `apps/desktop/src/shared/codex-runtime-state.ts`
- `apps/desktop/src/shared/runtime-state-channels.ts`
- `apps/desktop/src/main/runtime/CodexRuntimeStateRepository.ts`
- `apps/desktop/src/main/runtime/CodexRuntimeStateService.ts`
- `apps/desktop/src/main/runtime/CodexUpdateService.ts`
- `apps/desktop/src/main/runtime/registerRuntimeStateIpc.ts`
- `apps/desktop/src/main/app-server/verificationReason.ts`
- `apps/desktop/src/renderer/hooks/useCodexRuntimeState.ts`
- `apps/desktop/src/renderer/components/settings/runtimePresentation.ts`
- `apps/desktop/src/renderer/components/settings/CodexUpdateConfirmation.tsx`
- `apps/desktop/tests/runtime-state.test.cjs`
- `docs/verification/codex-runtime-state.md`

## Değiştirilen dosyalar

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/runtime/RuntimeCommandRunner.ts`
- `apps/desktop/src/main/runtime/RuntimeHealthService.ts`
- `apps/desktop/src/main/runtime/WindowsShimAdapter.ts`
- `apps/desktop/src/main/app-server/contracts.ts`
- `apps/desktop/src/main/app-server/CodexAppServerClient.ts`
- `apps/desktop/src/main/app-server/CodexSmokeTestService.ts`
- `apps/desktop/src/shared/codex-smoke-test.ts`
- `apps/desktop/src/shared/project-api.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/components/settings/CodexRuntimeRow.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsScreen.tsx`
- `apps/desktop/src/renderer/styles.css`
- `AGENTS.md`
- `README.md`

Eski `useCodexRuntimeHealth.ts`, `useCodexSmokeTest.ts` ve `CodexSmokeTestResultView.tsx` kaldırıldı. Düşük seviyeli health/smoke servis testleri korunur; eski ayrı IPC handler'ları artık main tarafından kaydedilmez ve preload API'sine açılmaz.

## Ekran görüntüleri

- `C:\WorkSpace\AI\Flux\.cache\codex-runtime-persistent.png`
- `C:\WorkSpace\AI\Flux\.cache\codex-update-confirmation.png`
- `C:\WorkSpace\AI\Flux\.cache\codex-runtime-update-blocked.png`
