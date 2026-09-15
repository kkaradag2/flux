# Phase 2B — Persistent conversation history

## Sonuç

Tek-agent konuşmaları main process içinde app-data JSON kayıtlarına atomik yazılır. İlk prompt kaydı oluşturur; New task boş kayıt üretmez. Sidebar örnekleri kaldırıldı, gerçek geçmiş proje altında son güncellenene göre sıralanır.

Electron'da Flux projesi ve Core Team / Lead ile gerçek konuşma oluşturuldu. Uygulama kapatılıp yeniden açıldı; sidebar kaydından iki mesaj geri yüklendi. Follow-up aynı kayıtlı Codex thread kimliğiyle devam etti ve `Hello from persisted Lead.` yanıtını verdi. Son kayıtta dört mesaj bulunuyor. Gerçek çağrılar sırasında proje kaynaklarının hash değerleri ve Git HEAD değişmedi. Diğer kayıtlı projelerin dosyaları incelenmedi.

## Doğrulama

- `pnpm test`: 122 başarılı, 0 başarısız; önceki testler korundu.
- `pnpm typecheck`: başarılı.
- `pnpm build`: başarılı.
- `git diff --check`: başarılı; yalnız mevcut Windows LF/CRLF dönüşüm uyarıları.
- Electron: gerçek kayıt oluşturma, aktif sidebar satırı, yeniden açılış, mesaj yükleme ve aynı thread ile follow-up doğrulandı.
- Servis testleri: atomik yazma, bozuk kayıtların korunması, user mesajının turn öncesi yazılması, checkpoint birleştirme/sırası, snapshot, failed/cancelled partial, Interrupted recovery, sahiplik/context koruması, thread/resume ve bulunamayan thread için yeni thread açmama.
- Package, commit ve push çalıştırılmadı. Yeni bağımlılık eklenmedi.

## Phase 2B dosyaları

Yeni:

- `apps/desktop/src/shared/conversation-api.ts`
- `apps/desktop/src/main/chat/ConversationRepository.ts`
- `apps/desktop/src/main/chat/ConversationCheckpoint.ts`
- `apps/desktop/src/renderer/hooks/useConversationHistory.ts`
- `apps/desktop/src/renderer/components/sidebar/relativeConversationTime.ts`
- `apps/desktop/tests/conversation-history.test.cjs`
- Bu doğrulama raporu.

Güncellenen (önceki aşamalardan henüz commit edilmemiş dosyalar da bulunur):

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/chat/SingleAgentRunService.ts`
- `apps/desktop/src/main/chat/registerSingleAgentIpc.ts`
- `apps/desktop/src/main/app-server/CodexChatSession.ts`
- `apps/desktop/src/main/app-server/contracts.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/project-api.ts`
- `apps/desktop/src/shared/single-agent-api.ts`
- `apps/desktop/src/shared/single-agent-channels.ts`
- `apps/desktop/src/renderer/hooks/useSingleAgentChat.ts`
- `apps/desktop/src/renderer/hooks/useProjectWorkspace.ts`
- `apps/desktop/src/renderer/state/WorkspaceContext.tsx`
- `apps/desktop/src/renderer/components/WorkspaceScreen.tsx`
- `apps/desktop/src/renderer/components/sidebar/AppSidebar.tsx`
- `apps/desktop/src/renderer/components/sidebar/ProjectList.tsx`
- `apps/desktop/src/renderer/components/sidebar/RequestHistoryList.tsx`
- `apps/desktop/src/renderer/components/chat/ChatWorkspace.tsx`
- `apps/desktop/src/renderer/components/composer/ComposerContextBar.tsx`
- `apps/desktop/src/renderer/components/team/TeamPanel.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/tests/single-agent-chat.test.cjs`
- `AGENTS.md`

Silinen: `apps/desktop/src/renderer/data/workspace-preview.ts`.

## Sınırlar

Partial mesajlar 2 saniyelik aralıklarla ve terminal durumda kaydedilir. Ani kapanmada son başarılı checkpoint sonrasındaki bölüm kaybolabilir. Sahipsiz running kayıtlar, mevcut status modelini koruyarak `failed` + `interrupted` işareti ve görünür Interrupted açıklamasına dönüştürülür. Agent kimliği, görünümü ve ayarları kayıt oluşturma snapshot'ından alınır.

Codex thread kimliği ve agent talimatları renderer DTO'suna gönderilmez. Kayıtlı thread bulunamazsa güvenli hata gösterilir; yeni thread açılarak geçmiş koparılmaz. Kayıtlı konuşmanın proje/branch/team bağlamı sabittir; farklı bağlam için New task kullanılır. Her turn gerçek HEAD kontrolü, read-only sandbox, kapalı tool network ve never approval koşullarını korur.

Görsel doğrulama çıktıları: `.cache/persistent-conversation-created.png` ve `.cache/persistent-conversation-resumed.png`. Bunlar geçici, Git tarafından ignore edilen çıktılardır.
