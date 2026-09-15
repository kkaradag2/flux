# Agent runtime sınırı ve Organizer doğrulaması

## Runtime bağımsız sözleşme

`shared/agent-runtime.ts`, runtime türünü (`codex | claude`), model ayarlarını ve `{ runtime, externalSessionId }` session referansını tanımlar. Application/domain modelleri executable, installation, App Server, threadId, protocol event veya outputSchema bilmez. Mevcut conversation persistence ve normal single-agent chat bu geliştirmede yeniden modellenmemiştir.

`AgentRuntimeAdapter.runTurn` session verilmezse yeni session başlatır, verilirse aynısını resume eder. Session açma ve turn tek çağrı sınırında tutulur; yarım açılmış session caller'a bırakılmaz. `cancel` ve AbortSignal desteklenir. Adapter instance'ları `AgentRuntimeRouter` içinde kayıtlıdır. Kayıtsız runtime veya eksik capability çağrıdan önce typed hata üretir. Gerçek Claude adapter yoktur; fake Claude ile aynı Organizer application servisinin çalıştığı test edilir.

`OrganizerDecisionExecutor` yalnız router/port kullanır. Agent instruction ve süzülmüş context'i compose eder, runtime'a mantıksal `organizer-decision` sonuç sözleşmesini verir ve dönen değeri mevcut semantik validator'dan geçirir. Internal discriminated union ve domain transition modelleri değişmemiştir. Generic hata sınırı `AgentRuntimeError` sınıfıdır; runtime/schema/cancellation/timeout/protocol/process hataları sabit güvenli mesajlarla döner.

## Codex adapter ve wire schema

`CodexAgentRuntimeAdapter` mevcut client, chat session ve JSONL transport'u yeniden kullanır. `VerifiedOrganizerRuntimeSource`, yalnız kayıtlı, seçili ve doğrulanmış installation ile eşleşen READY/passed state ve güncel health sonucunu kabul eder. Installation bilgileri adapter sınırından dışarı taşınmaz. Kurulu 0.154.0 generated `TurnStartParams` tipi `outputSchema?: JsonValue | null` alanını doğrular.

`CodexOrganizerSchema` düz root object envelope üretir: type, message, questions, planSummary, tasks. Bütün object alanları required; bütün object seviyelerinde additionalProperties=false. Root composition yoktur. Schema yalnız type/properties/required/additionalProperties/items/enum keyword'lerini kullanır. Internal validator'ın pattern, uniqueItems ve sayı sınırları wire schema'ya taşınmaz; dönüşümden sonra Flux tarafından uygulanır. Kullanılmayan alanlar boş string/array olmalıdır; dolu alanlar sessizce atılmaz, reddedilir.

`respond` ve `ask_user` için tasks/planSummary boş; respond için questions da boş. `create_plan` için questions boş olmalıdır. Envelope decode edildikten sonra güçlü internal union ve semantik validator tekrar kullanılır. Gelecekte başka adapter kendi wire formatını seçebilir.

Normal chat API'sinin varsayılan davranışı korunur. Organizer çağrısı tek final mesaj bekler, komut/tool/approval girişimini reddeder; inherited MCP/plugin erişimini mevcut fail-closed mekanizmayla kapatır. ReadOnly sandbox, networkAccess=false ve approvalPolicy=never uygulanır. Global config/model değiştirilmez.

## Session ve cleanup

Adapter'ın process içi session kilidi instance'lar arasında paylaşılır. Aynı session paralel turn alamaz; farklı session'lar birbirini engellemez. Yeni session kimliği de alınır alınmaz kilitlenir. Varsayılan süre bütçesi 43 saniyedir; interrupt/termination/exit doğrulama için bounded cleanup süreleri eklenebilir. İptalde aktif turn interrupt edilir, ardından process ve pending/listener kaynakları temizlenir. Organizer kaynağı, terminate komutunun dönmesine ek olarak gerçek child close/exit durumunu doğrular; bu seçenek normal chat'in varsayılan kapanış davranışını değiştirmez.

## Protocol tanılaması ve gerçek sonuç

Önceki internal schema root seviyesinde oneOf içeriyor ve root type:object tanımlamıyordu. Ayrıca wire üzerinde unsupported keyword kullanılmaması şartını sağlamıyordu. Internal union schema'sının doğrudan provider'a gönderilmesi somut schema sınırı hatasıydı. Önceki çağrının ham sunucu mesajı tutulmadığından geçmiş hatanın tam provider metni sonradan kanıtlanamaz; bu sınırlama gizlenmemiştir.

Tanılama artık RPC error response (method ve sayısal code), response ID uyuşmazlığı, turn failure/schema reddi ve process exit yollarını ayırır. Ham server metni yalnız infrastructure'da sabit kategoriye dönüştürülür; diagnostic callback'e veya generic hataya taşınmaz. Model/prompt/auth/stdout/stderr/path loglanmaz.

Bu çalışmanın gerçek doğrulamaları:

1. Codex 0.154.0 ve küçük `{ ok: boolean }` root object schema: **başarılı**, 10.439 ms. Böylece outputSchema plumbing'i doğrulandı. İlk cleanup ölçümü terminate/close yarışı nedeniyle erken yapılıyordu; close bekleyen doğrulama eklendi.
2. Router → Codex adapter → düz Organizer envelope: **tek gerçek çağrı**, retry yok. İstek email/password/confirm-password alanları, client-side validation, responsive layout, backend değişikliği olmadan implementation ve review görevleriydi. Sonuç **create_plan**, **2 task**, owner ID'leri **developer** ve **reviewer**, **23.303 ms**. Semantik validator ve dependency kontrolü başarılı.
3. Çağrı öncesi/sonrası Git HEAD, git status ve ignore edilmeyen repo dosyalarının SHA-256 manifest'i aynı. Tek App Server child açıldı; gerçek close event'i ve stdout/stderr listener temizliği doğrulandı.

Focused testler: router/architecture, wire schema, Organizer executor/validator, normal chat/streaming/Stop, conversation resume ve App Server transport. **89 farklı focused test başarılı** (son eklenen cancel testi ayrıca çalıştırıldı); **pnpm typecheck başarılı**. Electron, build/package, UI/IPC, task/run persistence, worker, scheduler, gerçek Claude, commit/push yok.

## Bu aşamadaki dosyalar

Yeni:

- `apps/desktop/src/shared/agent-runtime.ts`
- `apps/desktop/src/application/runtime/AgentRuntimeAdapter.ts`
- `apps/desktop/src/application/runtime/AgentRuntimeRouter.ts`
- `apps/desktop/src/application/runtime/AgentRuntimeError.ts`
- `apps/desktop/src/main/app-server/CodexAgentRuntimeAdapter.ts`
- `apps/desktop/src/main/app-server/CodexOrganizerSchema.ts`
- `apps/desktop/src/main/app-server/AppServerDiagnostic.ts`
- `apps/desktop/src/main/app-server/confirmProcessExit.ts`
- `apps/desktop/tests/agent-runtime-router.test.cjs`

Güncellenen:

- `apps/desktop/src/application/orchestration/organizer/OrganizerDecisionExecutor.ts`
- `apps/desktop/src/application/orchestration/organizer/OrganizerRuntimeContext.ts`
- `apps/desktop/src/application/orchestration/organizer/buildOrganizerInstruction.ts`
- `apps/desktop/src/main/app-server/CodexAppServerClient.ts`
- `apps/desktop/src/main/app-server/CodexAppServerTransport.ts`
- `apps/desktop/src/main/app-server/CodexChatSession.ts`
- `apps/desktop/src/main/app-server/VerifiedOrganizerRuntimeSource.ts`
- `apps/desktop/tests/organizer-executor.test.cjs`
- Bu belge ve `task-orchestration-core.md`.

Yerine genel port/hata sınırı getirilen eski `CodexOrganizerDecisionExecutor.ts` ve `OrganizerExecutionError.ts` kaldırıldı.

Açık noktalar: Gerçek Claude adapter, UI/persistence bağlantısı ve process'ler arası session kilidi yoktur. Capability beyanına ek olarak seçili kurulumun dinamik uygunluğu adapter içinde kontrol edilir; Codex sürüm allowlist'i yalnız generated protokolü doğrulanan 0.154.0'ı kapsar. Gelecekte yeni runtime sürümleri ayrıca doğrulanmalıdır.
