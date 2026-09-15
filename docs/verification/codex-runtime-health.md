# Codex runtime health — doğrulama

## Gerçek bilgisayar sonucu

- Runtime: Codex
- Sürüm: 0.151.0
- Authentication: ChatGPT
- Durum: Ready
- Kontrol tarihi: 15 Eylül 2026

Sonuç yalnızca CodexRuntimeProbe tarafından filtrelenmiş typed contract üzerinden alındı. Ham stdout/stderr raporlanmadı. Auth dosyası, token veya API key okunmadı; yalnızca codex --version ve codex login status çalıştırıldı.

## Yapı

RuntimeCommandRunner executable tespiti ve süreç yönetimini kapsüller. PATH üzerinde yalnızca codex executable adayları kontrol edilir; proje dizinleri taranmaz. WindowsShimAdapter sadece çözülmüş mutlak codex.cmd yolu ve sabit komut argümanlarına izin verir; shell:false, /d ve /v:off kullanılır, shell genişletme karakterleri reddedilir.

Version 5 saniye, authentication 10 saniye timeout kullanır. Windows timeout sonlandırması taskkill /t /f ile shim alt süreçlerini de kapsar; süreç ağacı sonlandırma çağrısı tamamlanmadan sonuç dönülmez. macOS/Linux doğrudan executable ve süreç grubu sonlandırma yolunu kullanır. Canlı işletim sistemi doğrulaması Windows'ta yapıldı; diğer platformlar bu ortamda çalıştırılmadı.

CodexRuntimeProbe status eşlemesini, RuntimeHealthService cache ve eşzamanlı çağrı birleştirmesini yönetir. Authentication yöntemleri sabit ChatGPT veya API key etiketleridir; bilinmeyen yöntem authenticated durumda null kalır. Sürüm yalnızca dar bir version token formatından kabul edilir. Beklenmeyen hata metinleri sabittir.

Settings → Runtimes ayrı ekranı useCodexRuntimeHealth üzerinden typed preload API kullanır. Refresh kontrol sırasında disabled olur. Runtime health agent veya workspace context'ine eklenmedi. Yeni bağımlılık yok.

## Doğrulamalar

- pnpm test: 24 geçti, 0 hata. Mevcut 13 test korundu; runtime grubu ve 10 alt testi eklendi.
- Not installed, ready, not authenticated, version/auth timeout, hassas stdout/stderr filtreleme, aynı promise paylaşımı ve Refresh testleri geçti.
- Windows shim için boşluklu path/quoting ve injection karakterlerinin reddi test edildi.
- Gerçek Codex gerektirmeyen test shim'inde timeout sonrası child PID'nin artık çalışmadığı doğrulandı.
- pnpm typecheck: başarılı.
- pnpm build: başarılı.
- pnpm package: başarılı, Windows x64 Forge paketi.
- git diff --check: başarılı.
- Electron açıldı; gerçek Codex sonucu Settings'te Ready / 0.151.0 / ChatGPT olarak görüldü.
- Settings navigation, cached get, Refresh kilidi, Last checked güncellemesi, unsaved değişiklik uyarısı, workspace mesaj/taslak/proje/branch korunması doğrulandı.
- Agents ve Teams erişimi kontrol edildi. Settings 600, 900 ve 1200px genişliklerde yatay taşma olmadan görüntülendi.
- UI kontrolünde renderer exception veya console error görülmedi.

Çözümlenmemiş blocker yok. Commit/push, agent çalıştırma, prompt gönderme, codex-acp, install/login/logout ve terminal açma eklenmedi.

## Dosyalar
- `AGENTS.md`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/runtime/CodexRuntimeProbe.ts`
- `apps/desktop/src/main/runtime/registerRuntimeHealthIpc.ts`
- `apps/desktop/src/main/runtime/RuntimeCommandRunner.ts`
- `apps/desktop/src/main/runtime/RuntimeHealthService.ts`
- `apps/desktop/src/main/runtime/WindowsShimAdapter.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/components/settings/CodexRuntimeRow.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsScreen.tsx`
- `apps/desktop/src/renderer/components/sidebar/AppSidebar.tsx`
- `apps/desktop/src/renderer/components/WorkspaceScreen.tsx`
- `apps/desktop/src/renderer/hooks/useCodexRuntimeHealth.ts`
- `apps/desktop/src/renderer/state/NavigationContext.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/shared/project-api.ts`
- `apps/desktop/src/shared/runtime-health-channels.ts`
- `apps/desktop/src/shared/runtime-health.ts`
- `apps/desktop/tests/runtime-health.test.cjs`
- `README.md`

## Ekran görüntüsü

[Settings](C:/WorkSpace/AI/Flux/.cache/settings-codex-runtime.png)
