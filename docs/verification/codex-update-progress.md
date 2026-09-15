# Codex update progress UX

## Değişiklik

Güncelleme komutları, hedef prefix seçimi, timeout, iptal, process cleanup ve eşzamanlı işlem engeli değiştirilmedi. Mevcut akışa yalnızca gözlemsel aşama bildirimleri eklendi:

1. PREPARING: kurulum hazırlığı başladığında.
2. INSTALLING: mevcut npm process başlatma noktasında.
3. CHECKING_VERSION: kurulum başarıyla tamamlanıp yeni sürüm/auth kontrolüne geçildiğinde.
4. VERIFYING_CONNECTION: mevcut gerçek bağlantı doğrulaması başladığında.
5. COMPLETED: başarı kaydedildiğinde; progress alanı kaldırılır, normal Ready görünümü gösterilir.

Typed progress snapshot'ı main process belleğinde aşama ve tek `startedAt` tarihi tutar. Settings kapanıp açıldığında aynı bilgi alınır. Runtime JSON formatına geçici progress yazılmaz; uygulama kapanışındaki mevcut işlem yönetimi değişmez. Hatalı sonuçta progress temizlenir ve mevcut hata görünümüne dönülür.

UI'da ince CSS indeterminate bar ve status spinner bulunur. Yüzde/sayaç veya ham npm çıktısı gösterilmez. Updating butonu işlem sırasında kaldırılır. Geçen süre yalnız progress bileşeninde 5 saniyede bir hesaplanır. Snapshot sorgulaması 2 saniye aralıklıdır; değişmeyen snapshot React state'ine tekrar yazılmaz. Reduced-motion tercihinde animasyon kapatılır.

## Doğrulamalar

- `pnpm test`: **86 geçti**, önceki 77 test korundu.
- `pnpm typecheck`: başarılı.
- `pnpm build`: başarılı.
- `pnpm package`: başarılı.
- `git diff --check`: başarılı.
- Yeni testler aşama metinlerini/sırasını, ortak başlangıç tarihini, ekran dönüşündeki snapshot'ı, ikinci update engelini, update butonunun kaldırılmasını, başarı/hata sonunda progress temizliğini, elapsed hesaplamasını ve gözlemci hatasının process tamamlanmasını etkilememesini doğrular.
- İzole Electron önizlemesinde gerçek React bileşenleri mock runtime snapshot'larıyla çalıştırıldı. INSTALLING sırasında Settings kapatılıp açıldı; aynı aşama/başlangıç zamanı korundu. CHECKING_VERSION ve VERIFYING_CONNECTION metinleri görüldü. Başarıda Ready, hatada normal hata görünümü oluştu; her iki durumda bar/spinner kaldırıldı.
- Bu UI revizyonunun doğrulaması için gerçek npm güncellemesi veya model çağrısı başlatılmadı.

## Dosyalar

Eklenen:

- `apps/desktop/src/shared/codex-update-progress.ts`
- `apps/desktop/src/renderer/components/settings/updateProgressPresentation.ts`
- `apps/desktop/src/renderer/components/settings/CodexUpdateProgressView.tsx`
- `apps/desktop/tests/update-progress.test.cjs`
- `docs/verification/codex-update-progress.md`

Değiştirilen:

- `apps/desktop/src/shared/codex-runtime-state.ts`
- `apps/desktop/src/main/runtime/CodexRuntimeStateService.ts`
- `apps/desktop/src/main/runtime/CodexUpdateService.ts`
- `apps/desktop/src/renderer/hooks/useCodexRuntimeState.ts`
- `apps/desktop/src/renderer/components/settings/runtimePresentation.ts`
- `apps/desktop/src/renderer/components/settings/CodexRuntimeRow.tsx`
- `apps/desktop/src/renderer/styles.css`

İzole önizleme ekran görüntüsü: `.cache/codex-update-progress-preview.png` (gerçek güncelleme değildir).

Yeni bağımlılık, commit veya push yoktur.
