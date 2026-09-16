# Organizer follow-up doğrulaması

Tarih: 2026-09-16. Branch: `feature/organizer-task-followup`.
Checkpoint HEAD: `4d3eb991783924f37f2b62898e3a37daa83ec827`. Commit, push veya package yapılmadı.

## Gerçek doğrulama sonucu

Electron'da mevcut signup conversation için **Ask Organizer** düğmesine bir kez basıldı. Tek gerçek model işlemi Organizer follow-up oldu. Developer continuation, Tester, Reviewer veya yeni plan başlatılmadı.

- Karar: `continue_task`; adapter süresi **13.408 ms** (13,408 saniye).
- Mesaj: “Implementation is reported, but verification remains incomplete.”
- Task: `5bc8e547-a1b5-4a9e-bc3a-f0f836aa759e` — Implement responsive signup screen.
- Kaynak task revision: **1** (eski schema-v2 kayıtları için uyumluluk başlangıcı).
- Kaynak result revision: **3** (son tamamlanmış attempt numarası).
- Intervention: `b2c3ce40-3c44-4b7e-a819-719016f891a4`; durum **applied**.
- Aynı Organizer session'ı resume edildi; uygulama callback ve terminal sonuçta session eşitliğini zorunlu tuttu. Kimlik renderer'a verilmedi ve bu rapora yazılmadı.
- Guidance kalıcı kaydedildi. Continue task düğmesine basılmadı; yeni task attempt açılmadı.
- Developer: `needs_attention`, 3 attempt. Tester: `planned`, 0 attempt. Reviewer: `planned`, 0 attempt. Dependency ilişkileri aynı.
- Çağrı sırasında Organizer yeşil Working, diğer üyeler Idle; conversation başlığı Organizer is evaluating ve Stop görüldü.
- Karardan sonra Organizer Idle; Needs attention, güvenli Organizer mesajı ve Continue task mevcut.
- Electron kapatılıp yeniden açıldı. Run/karar kaydı birebir aynı; tek intervention ve 3/0/0 attempt korundu. İkinci Organizer çağrısı yapılmadı. Electron karar ekranında açık bırakıldı.

## Dosya değişmezliği

Korunan run worktree'sinin HEAD'i `fa619bf4075d2c04518b89c8f61374db13798ed0`; başlangıçtaki checkpoint dosya hash'leri ve Git status ile eşleşti.

Gerçek çağrıdan önce/sonra ve restart öncesi/sonrasında tüm tracked ve untracked (ignore edilmeyen) dosyaların SHA-256 hash'leri, HEAD ve Git status karşılaştırıldı:

- Korunan worktree ve workspace kaydı değişmedi.
- Ana checkout, gerçek model çağrısı sırasında ve restart sırasında değişmedi.
- Bu özellik geliştirmesinin aşağıda listelenen kaynak/test/dokümantasyon değişiklikleri ana checkout'tadır; bunlar beklenen geliştirme değişiklikleridir.

Yerel kanıtlar: `.cache/follow-up-result-proof.json`, `.cache/follow-up-restoration-proof.json`. Session içeren ham snapshot'lar kullanıcıya veya dış servise gönderilmedi.

## Uygulama ve sınırlar

Application katmanında provider bağımsız `FollowUpDecision` union'ı ve `OrganizerFollowUp` servisi eklendi. Runtime seçimi `AgentRuntimeRouter` üzerinden; Codex'in strict flat wire envelope ve decode işlemi adapter katmanında. Fake Claude aynı internal kararları kullanıyor.

Intervention kaydı mevcut schema-v2 aggregate içinde tutulur. Task revision ve result/attempt revision birlikte doğrulanır. `pending` kaydı modelden önce yazılır; duplicate istek ikinci çağrı açmaz. `decided` karar ve domain transition aynı serialized repository işlemi içinde `applied` olur. `accept_result`, merkezi domain API ile taskı tamamlar ve dependency'leri ready yapar; sonraki taskı başlatmaz. Recovery, pending çağrıyı bir kez failed yapar; alınmış decided kararı stale değilse uygular. Otomatik retry yoktur.

`requestOrganizerFollowUp({ runId })` ve `continueAttentionTask({ runId })` dar IPC uçlarıdır. Renderer owner/task/session/runtime/path/karar seçemez. `continueTeamPrompt` mevcut ask_user intervention'ına cevapları yönlendirir. Trusted main frame, owner disposal, Stop ve shutdown kontrolleri korunur.

Continue task yolu aynı owner/session ile yeni attempt açmaya ve guidance göndermeye hazırdır; yalnız fake adapter testleriyle çalıştırıldı. Gerçek Developer continuation sonraki açık kullanıcı eylemini bekliyor. Kullanıcı cevabı/model çağrısı gerçek ortamda çalıştırılmadı.

## Doğrulama

- Son focused Organizer testleri: **36/36** (üst test dahil).
- Tüm regresyon: **413/413**, `node --test --test-concurrency=1 apps/desktop/tests/*.test.cjs`.
- `pnpm typecheck`: geçti.
- `pnpm build`: geçti.
- `git diff --check`: geçti.
- Kapsam: üç karar, iki fake provider, session yokluğu/değişmesi, duplicate, stale revision, accept/dependency, guidance/session/attempt, ask_user chat/restoration/routing, pending recovery idempotency, Working/Idle ve başlık, Stop/late cancel/shutdown/disposal, dar IPC, single-agent/planning/execution/retry/schema-v2 regresyonları.
- Mevcut project-services testinin eksik `GitCommandRunner` derleme girdisi onarıldı; yeni API ve validator bağımlılıkları için test fixture listeleri güncellendi.

## Açık noktalar

- Gerçek task continuation ve gerçek kullanıcı cevabı bu aşamanın sınırı gereği çalıştırılmadı.
- İlk gerçek guidance'ta slash ile ayrılmış iki ifade path temizleyici tarafından maskelendi. Temizleyici `typecheck/build` gibi sıradan ifadeleri koruyacak şekilde daraltıldı ve test edildi. Alınmış karar yeniden yazılmadı, ikinci model çağrısı yapılmadı; guidance'ın temel doğrulama talimatları korunuyor.
- Scheduler, plan revision, yeni task, role özgü karar veya otomatik Tester/Reviewer başlatma eklenmedi.

## Değişen dosyalar

- `apps/desktop/src/application/orchestration/execution/AgentTaskExecutor.ts`
- `apps/desktop/src/application/orchestration/execution/TaskExecutionCoordinator.ts`
- `apps/desktop/src/application/orchestration/organizer/FollowUpDecision.ts`
- `apps/desktop/src/application/orchestration/organizer/OrganizerFollowUp.ts`
- `apps/desktop/src/application/runtime/AgentRuntimeAdapter.ts`
- `apps/desktop/src/domain/orchestration/Orchestration.ts`
- `apps/desktop/src/domain/orchestration/events.ts`
- `apps/desktop/src/domain/orchestration/interventions.ts`
- `apps/desktop/src/domain/orchestration/models.ts`
- `apps/desktop/src/main/app-server/CodexAgentRuntimeAdapter.ts`
- `apps/desktop/src/main/app-server/CodexFollowUpSchema.ts`
- `apps/desktop/src/main/orchestration/JsonOrchestrationRepository.ts`
- `apps/desktop/src/main/orchestration/OrchestrationService.ts`
- `apps/desktop/src/main/orchestration/OrchestrationViews.ts`
- `apps/desktop/src/main/orchestration/TeamConversationJournal.ts`
- `apps/desktop/src/main/orchestration/composeOrchestration.ts`
- `apps/desktop/src/main/orchestration/orchestrationRecord.ts`
- `apps/desktop/src/main/orchestration/registerOrchestrationIpc.ts`
- `apps/desktop/src/preload/orchestrationApi.ts`
- `apps/desktop/src/renderer/components/chat/ChatMessageList.tsx`
- `apps/desktop/src/renderer/components/chat/ChatWorkspace.tsx`
- `apps/desktop/src/renderer/components/chat/ExecutionPlanCard.tsx`
- `apps/desktop/src/renderer/hooks/useTeamPlanning.ts`
- `apps/desktop/src/renderer/state/WorkspaceContext.tsx`
- `apps/desktop/src/shared/orchestration-api.ts`
- `apps/desktop/src/shared/orchestration-channels.ts`
- `apps/desktop/tests/orchestration-main.test.cjs`
- `apps/desktop/tests/orchestration-persistence.test.cjs`
- `apps/desktop/tests/organizer-executor.test.cjs`
- `apps/desktop/tests/organizer-follow-up.test.cjs`
- `apps/desktop/tests/project-services.test.cjs`
- `apps/desktop/tests/team-planning-ui.test.cjs`
- `docs/verification/organizer-follow-up.md`
