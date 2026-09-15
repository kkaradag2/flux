# Phase 2A — Single-agent chat

## Sonuç

New task composer gerçek Codex App Server'a bağlıdır. Kayıtlı team'in sıralamasındaki ilk enabled agent çalışır; Core Team'de Lead. Kullanıcı mesajı sağda, güvenli Markdown agent yanıtı solda streaming gösterilir. Yalnız çalışan agent Working olur; bitiş, hata ve Stop sonunda Idle'a döner.

Renderer yalnız `projectId`, `branch`, `teamId`, `prompt` gönderir. Main process kayıtlı proje yolu, agent instructions, model/effort ve doğrulanmış executable seçimini çözer. Fazladan IPC alanları reddedilir. Model/effort default ise override gönderilmez.

İlk gönderimde ephemeral thread oluşturulur; follow-up aynı thread ve process'i kullanır. New task thread/process'i temizler. Settings ve agent/team ekranları sohbeti silmez; Back to task ile geri dönülür. Uygulama kapanışı, renderer kaybı veya reload oturumu temizler. Conversation diske kaydedilmez.

## Güvenlik ve protokol

- `approvalPolicy: never`, readOnly sandbox, tool network kapalıdır.
- Her gönderimde kayıtlı projenin gerçek HEAD branch'i kontrol edilir. Eşleşmezse `For now, choose the currently checked-out branch.` gösterilir; process başlatılmaz.
- Codex'in multi-agent ve apps araçları, web search, kayıtlı MCP sunucuları ve ilgili plugin'ler yalnız thread düzeyinde kapatılır. Global yapılandırma değiştirilmez. Thread envanterinde dış araçlar kalırsa turn başlamadan güvenli hata döner.
- Beklenmedik approval istekleri reddedilir. Ham stderr, protocol hatası veya tool çıktısı renderer'a gönderilmez; yalnız agent mesajı ve sabit güvenli hata metinleri aktarılır.
- Kurulu **Codex CLI 0.154.0** `generate-ts` şeması incelendi. Kullanılan minimum thread/start, turn/start, turn/interrupt ve MCP envanter contract'ları runtime guard'larla işlendi; üretilen şema kaynak repoya eklenmedi.
- Yapılandırma alanları için [resmî Codex configuration reference](https://developers.openai.com/codex/config-reference) kontrol edildi.

## Doğrulama

- `pnpm test`: **106 geçti**, önceki 86 test korundu.
- `pnpm typecheck`: başarılı.
- `pnpm build`: başarılı.
- `git diff --check`: başarılı.
- Gerçek Electron / Flux / `feature/single-agent-chat` / Core Team:
  - `Reply with exactly: Hello from Lead.` → **Hello from Lead.**
  - Altı messageDelta olayı ve streaming sırasında görünen mesaj/caret doğrulandı.
  - Önceki cevabı soran follow-up → **Hello from Lead.**; aynı conversation korundu. Protokol testinde tek thread/start ve aynı threadId ile iki turn/start doğrulandı.
  - Settings'e geçiş ve Back to task dönüşünde chat korundu.
  - Uzun yanıt üretilirken Stop tıklandı; cancelled olayı ve Idle durumu görüldü. Servis testinde turn/interrupt thread/turn kimlikleri ve listener temizliği doğrulandı.
  - main seçiliyken branch uyuşmazlığı hatası görüldü; yeni agent started olayı oluşmadı. Git checkout/switch yapılmadı.
  - Model testleri öncesi/sonrası Git'in izlediği ve ignore edilmemiş proje dosyalarının SHA-256 değerleri ile HEAD karşılaştırıldı: **değişiklik yok**. Doğrulama sonunda Flux / feature/single-agent-chat seçimi ve boş New task ekranı bırakıldı.

Ekran görüntüsü: [Single-agent chat](../../.cache/single-agent-chat.png).

## Eklenen dosyalar

- `apps/desktop/src/shared/single-agent-api.ts`
- `apps/desktop/src/shared/single-agent-channels.ts`
- `apps/desktop/src/main/chat/SingleAgentRunService.ts`
- `apps/desktop/src/main/chat/registerSingleAgentIpc.ts`
- `apps/desktop/src/main/app-server/CodexChatSession.ts`
- `apps/desktop/src/renderer/hooks/useSingleAgentChat.ts`
- `apps/desktop/tests/single-agent-chat.test.cjs`
- `docs/verification/phase2a-single-agent-chat.md`

## Güncellenen dosyalar

- `AGENTS.md`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/app-server/CodexAppServerClient.ts`
- `apps/desktop/src/main/app-server/contracts.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/shared/project-api.ts`
- `apps/desktop/src/renderer/state/WorkspaceContext.tsx`
- `apps/desktop/src/renderer/components/WorkspaceScreen.tsx`
- `apps/desktop/src/renderer/components/chat/ChatWorkspace.tsx`
- `apps/desktop/src/renderer/components/chat/ChatMessageList.tsx`
- `apps/desktop/src/renderer/components/composer/PromptComposer.tsx`
- `apps/desktop/src/renderer/components/composer/ComposerToolbar.tsx`
- `apps/desktop/src/renderer/components/composer/ComposerContextBar.tsx`
- `apps/desktop/src/renderer/components/shared/Icon.tsx`
- `apps/desktop/src/renderer/components/team/TeamPanel.tsx`
- `apps/desktop/src/renderer/components/team/TeamMemberRow.tsx`
- `apps/desktop/src/renderer/styles.css`

## Sınırlar

Tek aktif turn; 120 saniye timeout. Stop turn/interrupt gönderir; 2 saniyede terminal bildirim gelmezse process sonlandırılır. Timeout, process kaybı veya zorunlu sonlandırma sonrasında New task gerekir. Konuşma sırasında proje/team/agent/runtime yapılandırması değişirse aynı thread'e karıştırılmaz; New task istenir.

Attachments, conversation persistence, dosya yazma, checkout/worktree veya multi-agent geliştirilmedi. Yeni bağımlılık eklenmedi. **Package, commit ve push çalıştırılmadı.**
