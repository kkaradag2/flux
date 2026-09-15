# Task orchestration domain çekirdeği

## Sınır ve checkpoint

Kullanıcının seçimiyle `origin/main` temel alındı. Temiz yerel `main`, `fa619bf4075d2c04518b89c8f61374db13798ed0` commit'ine fast-forward edildi; `git push origin main` sonucu `Everything up-to-date` oldu. Yeni boş commit oluşturulmadı. `feature/task-orchestration-core` aynı HEAD üzerinden oluşturuldu, origin'e push edildi ve upstream ayarlandı.

Bu temel Phase 2A/2B değişikliklerini içerir. Henüz main'e merge edilmemiş Phase 2C worktree değişiklikleri bu branch'e alınmadı. Yeni domain geliştirmesi commit/push edilmedi.

Domain `apps/desktop/src/domain/orchestration` altında yer alır. Electron, React, IPC, filesystem, persistence, Git ve runtime bağımlılığı yoktur. Ayrı `tsconfig.domain.json`, Node/DOM ambient tipleri olmadan strict typecheck yapar. UI veya mevcut single-agent chat akışına bağlanmamıştır.

## Modeller ve API

- `TeamRun`: conversation/proje/takım/Organizer bağı, hedef, run durumu ve tarihler.
- `ExecutionPlan`: run'a bağlı, ID'si korunan ve her revizyonda sürümü artan plan snapshot'ı. Eski sürümler değiştirilmez.
- `AgentTask`: tek assignee, oluşturma kararından gelen delegator, dependency listesi, kabul kriterleri, review şartı ve tarihler.
- `OrchestrationState`: run, task'lar ve plan sürümlerinin salt okunur snapshot'ı.
- `OrchestrationEvent`: ortak kimlik, run, zaman ve actor alanları olan discriminated union.

İki giriş noktası vardır:

```ts
const created = createTeamRun(runInput, decision);
const result = applyOrchestrationCommand(created.state, command, nextDecision);
// result.state ve result.events birlikte ele alınmalıdır.
```

`decision` alanları `id`, `agentId`, `occurredAt` şeklindedir. Kimlik ve saat çağıran katman tarafından sağlanır; domain saat okumaz, UUID üretmez, dış çağrı yapmaz. Event ID'leri `<decision.id>:<sıra>` olarak deterministik üretilir. Çağıran katman her yeni karar için benzersiz ID sağlamalıdır.

Komutlar:

| Komut | İşlem |
| --- | --- |
| `tasks.create` | Bir veya birden fazla task ekler; batch içindeki ileri dependency referansları desteklenir. |
| `task.assign` | İnaktif task'ı tek bir farklı agent'a atar. Delegator korunur. |
| `task.set_dependencies` | Henüz başlamamış planned/ready task'ın dependency grafiğini değiştirir. |
| `task.transition` | Task durumunu tek geçiş tablosu üzerinden değiştirir. |
| `plan.create` | İlk planı version 1 ile oluşturur. |
| `plan.revise` | Aynı plan ID'sinin yeni sürümünü ekler. |
| `run.transition` | Organizer'ın run durum kararını uygular. |

Input değiştirilmez. Sonuç ve event payload'ları kopyalanarak recursive freeze edilir; TypeScript alanları ve dizileri de readonly'dir. Hatalı komut yeni state/event sonucu döndürmeden `OrchestrationError` ve typed hata kodu üretir.

## Dependency ve task kuralları

Her task aynı run'a ait, var olan dependency'lere referans verir. Self dependency, duplicate dependency/ID ve cycle reddedilir. Cycle kontrolü recursive olmayan topological traversal kullanır. Task oluşturma ve dependency değişiklikleri bütün graph doğrulanmadan kabul edilmez.

Dependency'siz veya bütün dependency'leri completed olan planned task otomatik ready olur. Bir task completed olduğunda bekleyen task'lar yeniden değerlendirilir. Failed, cancelled veya needs_review dependency tamamlanmış sayılmaz. Blocked task otomatik açılmaz; uygun actor'dan açık karar gerekir.

| Mevcut task durumu | İzin verilen hedefler |
| --- | --- |
| planned | ready, blocked, cancelled |
| ready | working, blocked, cancelled |
| working | blocked, needs_review, completed, failed, cancelled |
| blocked | ready, failed, cancelled |
| needs_review | ready, blocked, completed, failed, cancelled |
| failed | ready, cancelled |
| completed / cancelled | Yok |

Ek koşullar:

- Working için run running olmalı, task ready olmalı, dependency'ler completed olmalı ve başlayan actor assignee olmalıdır.
- `requiresReview=true` task working'den doğrudan completed olamaz; needs_review aşaması gerekir.
- Blocked/failed/cancelled kararlarında reason zorunludur. Blocked/failed/needs_review → ready için Organizer veya delegator kararı ve reason gerekir.
- Reassignment yalnız Organizer/delegator tarafından, working/needs_review dışındaki terminal olmayan task'larda yapılır.
- Completed/cancelled task'ın status, assignment veya dependency'leri değiştirilemez.
- Dependency düzenlemesi ready task'a tamamlanmamış dependency eklerse onu planned durumuna geri alır. Bu değişiklik `task.dependencies_changed` event'inde görünür.
- `startedAt` ilk başlama zamanını korur. `completedAt`, completed/failed/cancelled sonucunda doldurulur; yeniden ready yapıldığında temizlenir. Ayrı retry attempt modeli bu aşamada yoktur.

## Run ve plan kararları

Run'ı ve planı yalnız Organizer yönetir. Planning → running/waiting_input/failed/cancelled; running → waiting_input/completed/failed/cancelled; waiting_input → planning/running/completed/failed/cancelled geçişleri vardır. Completed/failed/cancelled run yeniden açılmaz.

`required` task alanı varsayılan `true`'dur. Organizer run'ı tamamlamadan önce bütün required task'lar completed olmalıdır. Required task'ın cancelled olması bu koşulu sağlamaz. Opsiyonel task'lar hazır/bekleyen durumda bırakılabilir; working veya needs_review opsiyonel task varsa run completion engellenir. Son task bittiğinde run kendiliğinden completed olmaz.

Run failed/cancelled olduğunda kalan task'lar cancelled yapılır ve event'leri üretilir; completed task'lar korunur. Run failed olduğunda zaten failed olan task sonucu da korunur. Bu yalnız domain durum uzlaştırmasıdır; gerçek process iptal etmez.

Planlar duplicate/missing task ID, eksik dependency ve dışarıda bırakılmış required task kabul etmez. Plan listesi sıralama zorunluluğu taşımaz; execution sırasını dependency grafiği belirler. Çalışma sırasında task eklenmesi plan sürümünü otomatik değiştirmez; Organizer açıkça revise etmelidir.

## Event sözleşmesi

İstenen run/plan/task event tiplerinin tamamı tanımlıdır. Task event'leri `taskId` ve ilgili assignee `agentId` taşır; plan/run event'lerinde `agentId` karar veren Organizer'dır. `actorAgentId`, assignee'dan ayrı olarak kararı kayda geçiren actor'ı belirtir. Task.created snapshot'ı planned durumunu, ardından task.ready event'i geçişi temsil eder. Run terminal kararı önce `run.status_changed`, sonra ilgili terminal run event'ini üretir.

Dependency düzenleme için ayrıca `task.dependencies_changed` vardır. Event persistence aşağıdaki aggregate repository üzerinden sağlanır; event bus ve IPC eklenmemiştir.

## Organizer runtime instruction ve karar sözleşmesi

Organizer global bir Agent rolü veya ayrı Planner kaydı değildir; Team üzerindeki `organizerAgentId` ile seçilen üyedir. `createOrganizerRuntimeContext`, seçilmiş agent'ı ve takım üyelerini kayıtlı tanımlardan süzer. Context; takım, Organizer, conversation, proje, branch ve kullanıcı isteğini içerir. Üyeler için yalnız ID, ad, açıklama, runtime türü ve enabled bilgisi taşınır; diğer üyelerin instruction/model ayarları taşınmaz.

`buildOrganizerInstruction`, agent'ın mevcut instruction metni ile Flux Organizer sözleşmesini yalnız runtime için compose eder. Agent/Team kayıtlarını değiştirmez veya kaydetmez. Context JSON olarak açık alan projeksiyonuyla eklenir; yapısal olarak uyumlu fakat fazladan alan içeren nesnelerdeki diğer instruction'lar da prompta kopyalanmaz. Runtime sözleşmesi çıktı/atama kurallarını belirler; açıklamalar ve kullanıcı isteği bu sözleşmeyi değiştiren talimatlar olarak değerlendirilmez.

`OrganizerDecision` üç sonuç içerir: sorular için `respond`, zorunlu bilgi eksikliğinde 1–3 soruluk `ask_user`, yeterli bilgi varsa 1–50 task içeren `create_plan`. Task key'leri yalnız aynı karar içinde kullanılan, 1–48 karakterlik harf/rakam/alt çizgi/tire anahtarlarıdır; kalıcı ID değildir. Her task tek owner, dependency listesi, en az bir benzersiz ve boş olmayan acceptance criterion ve review bayrağı taşır. Agent seçimini LLM yapar; üyelik, enabled durumu ve invariantları Flux doğrular. İlk karar genel işi tamamlamaz veya worker çalıştırmaz.

Strict JSON Schema, discriminator için `oneOf` ve sabit `type`, açık required alanları ve `additionalProperties: false` kullanır. Runtime yapısal doğrulayıcı aynı schema'yı tüketir. Takım üyeliği ve dependency referansları/cycle kontrolü statik schema'nın dışında bağlama bağlı doğrulamalardır. Mevcut domain `validateTaskGraph` algoritması yalnız geçici graph projeksiyonuyla yeniden kullanılır; domain modeli, transition API ve persistence değiştirilmez. Sonuç kopyalanıp dondurulur; typed hata kodları ham model çıktısını içermez. JSON dışı metin/fence, ek veya eksik alanlar reddedilir; repair/retry yoktur.

Kod: `apps/desktop/src/application/orchestration/organizer/` altında `OrganizerRuntimeContext.ts`, `buildOrganizerInstruction.ts`, `OrganizerDecision.ts`, `organizerDecisionSchema.ts`, `validateOrganizerDecision.ts`, `OrganizerDecisionError.ts`.

Doğrulama: `node --test apps/desktop/tests/organizer-decision.test.cjs` **12 başarılı (üst test dahil)**; `pnpm typecheck` başarılı. Testler bağımsız bir schema keyword değerlendiricisiyle temel yapısal örneklerde aynı sonucu, runtime semantik kontrollerini ve instruction sızıntısı engelini doğrular. Yeni bağımlılık, Electron açılışı, build/package veya model çağrısı yapılmadı.

Sonraki entegrasyonda güvenilir context kaynağı, App Server'ın desteklediği structured-output JSON Schema alt kümesi, kararın kalıcı task ID'lerine dönüştürülmesi ve execution/persistence bağlantısı ele alınacak. Bunlar bu aşamada bağlı değildir; instruction metni tek başına model davranışının garantisi sayılmaz.

### Runtime adapter ve gerçek Organizer doğrulaması

Güncel runtime port/router sınırı, adapter'a özel wire schema, güvenli protocol tanılaması ve başarılı gerçek smoke sonucu [Agent runtime adapter mimarisi](agent-runtime-adapters.md) belgesindedir. Önceki Codex'e bağlı application executor bu genel servisle değiştirildi.

## Focused doğrulama

- `node --test apps/desktop/tests/orchestration-domain.test.cjs`: **27 başarılı, 0 başarısız**. Dependency, geçiş, terminal, review, assignment, Organizer, plan version, event payload ve immutability testleri.
- `pnpm typecheck`: **başarılı**; domain, typed contract negatif örnekleri ve mevcut Node/renderer typecheck.
- Full test suite, build, package, Electron veya gerçek agent çalıştırılmadı.

## Bilinen açık noktalar

Scheduler, paralellik limiti, agent üyelik/yetenek doğrulaması, reviewer yetki politikası, kabul kriterlerinin gerçekten sağlandığına ilişkin kanıt ve komut idempotency'si bu aşamada yoktur. Çağıran uygulama actor kimliğini güvenilir biçimde çözmelidir. Domain, review aşamasını zorunlu tutar; gerçek review işlemini gerçekleştirmez.

## Aggregate persistence

Disk konumu `<Electron userData>/orchestration/<SHA-256(runId)>.json` şeklindedir. Dosya adı kullanıcı girdisini path olarak yorumlamaz. Kayıt formatı:

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "run": {},
  "plans": [],
  "tasks": [],
  "events": []
}
```

`OrchestrationRepository` tek run aggregate'inin sözleşmesidir. `create`, `save` ve kilit altında çalışan `update`, domain sonucundaki state ile yeni event'leri birlikte saklar. Run, conversation run listesi, aktif run, güncel plan, task ve event sorguları vardır. `rehydrate` tek snapshot'tan state, güncel plan, kronolojik event geçmişi ve revision döndürür. Plan/task/event için bağımsız yazıcılar yerine bu aggregate sınırı kullanılır; böylece ilgili kayıtlar birbirinden kopamaz.

Application katmanındaki `PersistedOrchestration`, mevcut `createTeamRun` ve `applyOrchestrationCommand` API'lerini çağırır. `applyBatch`, örneğin task oluşturma ile plan oluşturmayı tek transaction'da saklar. Task ve run transition'ları da ürettikleri bütün event'lerle birlikte yazılır. Transition kuralları persistence içinde yeniden tanımlanmaz; domain dosyaları ve mevcut conversation persistence değiştirilmemiştir.

`AtomicFileWriter`, aynı klasörde benzersiz geçici dosyayı `wx` ile açar, yazar, `sync` ve `close` sonrasında hedefe rename eder. Rename öncesindeki hatalarda önceki kayıt korunur; geçici dosya temizlenir. Başarılı rename geçici dosyayı hedef kayda dönüştürür. Aynı canonical run dosyasına erişimler, aynı main process içindeki repository örnekleri arasında paylaşılan promise kuyruğunda serialize edilir. Önceden hesaplanmış `save` sonuçlarında `expectedRevision` eski snapshot'ın yeni veriyi ezmesini engeller.

Okumada schema version, model alanları, ilişkiler, ISO tarihler, event kimlikleri ve plan sürümleri doğrulanır. Bozuk JSON, desteklenmeyen şema, duplicate event/plan ve dosya hataları güvenli mesajlı `OrchestrationPersistenceError` üretir. Tarihler mevcut domain modeline uygun ISO **string** olarak korunur; `Date` modeline çevrilmez. Planlar sürüme, event'ler `occurredAt` zamanına göre sıralanır; eşit zamanlı event'lerin kayıt sırası korunur. Rehydrate sonucu salt okunurdur.

`createOrchestrationRepository` konumu `app.getPath('userData')` üzerinden alır; host ayrıca kayıtlı proje ve worktree köklerini hariç tutulan konumlar olarak verir. Proje/worktree altındaki userData ve orchestration klasörünü başka yere yönlendiren symlink/junction reddedilir. Mevcut geliştirme profilinin repo içindeki `.flux/desktop` konumu bu kuralla uyumlu değildir: ileride host entegrasyonunda repo dışında userData kullanılmalıdır. Bu aşamada mevcut profil değiştirilmedi ve repository Electron başlangıcına/IPC'ye bağlanmadı.

Gelecekte SQLite adapter'ı aynı repository sözleşmesini uygulayabilir; domain ve application transition akışı dosya formatına bağımlı değildir. Process'ler arası kilit, genel şema migration altyapısı, event arşivleme ve scheduler recovery bu aşamada yoktur. Bozuk kayıtlar sessizce atlanmaz; listeleme de typed hata döndürür.

### Organizer planning application akışı

`TeamPromptCoordinator`, `TeamPromptSource` üzerinden güvenilir proje, seçili proje kimliği, conversation, takım ve agent tanımlarını çözer. Çağıran yalnız kimlikler, prompt ve isteğe bağlı cancellation signal verir. Runtime ayarları ve çalışma dizini bu kayıtlardan gelir. En az iki farklı kayıtlı üye, üyeler arasından enabled Organizer, conversation/proje eşleşmesi ve runtime capability kontrolü model çağrısından önce yapılır. Executor/router runtime bağımsızdır; somut adapter veya protokol tipi application/domain'e girmez.

Yeni run ve `run.created` önce `planning` olarak atomik kaydedilir. Runtime'ın await edilen `onSession` callback'i, model turn'ü başlamadan `run.set_organizer_session` domain command'iyle `AgentSessionReference` değerini kalıcılaştırır. Session değiştirilemez; aynı referansın tekrar bildirilmesi event üretmez. Disk formatı `schemaVersion: 1` olarak kalır: eksik `organizerSession` alanı hem run hem run-created snapshot'ında `null` hydrate edilir ve sonraki yazmada açıkça saklanır.

- `respond`: Merkezi `run.respond` command'i plansız/tasksız run'ı tamamlar; `run.completed` üretir. Genel run transition tablosunun eski kuralları korunur.
- `ask_user`: Run `waiting_input` olur. Mesaj ve sorular application result'ta döner; otomatik ikinci çağrı yapılmaz.
- `create_plan`: Flux ID üreticisi model key'lerini kalıcı task ID'lerine dönüştürür. Merkezi `plan.initialize` command'i graph ve plan kurallarını doğrular; plan version 1, tasklar, ilk atamalar, root task readiness ve running status tek repository update içinde yazılır. Event sırası plan.created → task.created → task.assigned → task.ready → run.status_changed'dır. Önceden kalıcılaştırılan session aynı aggregate snapshot'ında korunur.

`continueRun`, yalnız `waiting_input` ve kayıtlı session ile çalışır. Takım/Organizer/runtime uyumu yeniden doğrulanır; aynı referans executor'a aktarılır. Run planning'e geçer, ardından üç karar türünden biri uygulanır. Process içindeki coordinator örnekleri aynı run için ortak continuation kilidini kullanır; ikinci çağrı typed RUN_BUSY ile reddedilir. Kullanıcı cevabı event payload'ına veya loglara kopyalanmaz.

Her yazma mevcut per-run repository kuyruğu ve atomik temp + sync + rename altyapısını kullanır. Başarısız plan yazması kısmi plan/task bırakmaz. Runtime hatasında güvenli sabit mesajlı failed/cancelled transition kaydedilir; session ve önceki event geçmişi korunur. Disk tamamen yazılamıyorsa önceki sağlam snapshot korunur ve PERSISTENCE_FAILED döner; bu durumda terminal status'un kaydedildiği iddia edilmez.

Bu servis henüz Electron başlangıcı, UI veya IPC'ye bağlanmaz. `TeamPromptSource` host adapter'ı ve üretim clock/ID sağlayıcısı sonraki entegrasyonda bağlanacaktır. Plan revision, scheduler, worker çalıştırma ve kapanış sonrası yarım planning run recovery kapsam dışıdır. Mesaj/soru sonucu ayrıca persist edilmez; bu aşamada application result olarak döner.

#### Planning flow doğrulaması ve değişen dosyalar

Checkpoint: `16b88947310fe7c77541d468f932859f9b7df328`. `feature/task-orchestration-core` push edildi; `feature/organizer-planning-flow` aynı HEAD'den oluşturulup upstream ile push edildi. Aşağıdaki yeni geliştirme commit/push edilmedi.

Focused komut:

```text
node --test apps/desktop/tests/team-prompt-coordinator.test.cjs apps/desktop/tests/orchestration-domain.test.cjs apps/desktop/tests/orchestration-persistence.test.cjs apps/desktop/tests/organizer-executor.test.cjs apps/desktop/tests/agent-runtime-router.test.cjs apps/desktop/tests/organizer-decision.test.cjs
```

Sonuç: üst testler dahil **125 başarılı, 0 başarısız**. `pnpm typecheck` ve `git diff --check` başarılı. Gerçek runtime çağrısı, Electron, build/package veya görsel test yapılmadı. Yeni testler fake executor/runtime ve izole, temizlenen persistence klasörlerini kullanır. Mevcut domain testindeki import sınırı yalnız runtime bağımsız `AgentSessionReference` type import'una izin verecek şekilde genişletildi; eski transition testleri korundu.

Yeni dosyalar:

- `apps/desktop/src/application/orchestration/TeamPromptCoordinator.ts`
- `apps/desktop/src/application/orchestration/TeamPromptSource.ts`
- `apps/desktop/src/application/orchestration/TeamPromptError.ts`
- `apps/desktop/tests/team-prompt-coordinator.test.cjs`

Güncellenen dosyalar:

- `apps/desktop/src/application/orchestration/organizer/OrganizerDecisionExecutor.ts`
- `apps/desktop/src/application/runtime/AgentRuntimeAdapter.ts`
- `apps/desktop/src/domain/orchestration/models.ts`
- `apps/desktop/src/domain/orchestration/events.ts`
- `apps/desktop/src/domain/orchestration/Orchestration.ts`
- `apps/desktop/src/main/app-server/CodexAgentRuntimeAdapter.ts`
- `apps/desktop/src/main/orchestration/orchestrationRecord.ts`
- `apps/desktop/tests/orchestration-domain.test.cjs`
- `apps/desktop/tests/organizer-executor.test.cjs`
- `docs/architecture/task-orchestration-core.md`

### Persistence doğrulaması ve dosyaları

- `node --test apps/desktop/tests/orchestration-persistence.test.cjs`: **23 başarılı, 0 başarısız** (üst test dahil). Her senaryo izole geçici klasörde çalışır ve temizlenir; gerçek kullanıcı verisi kullanılmaz.
- `pnpm typecheck`: **başarılı**. Bu geliştirmede yalnız focused persistence testleri ve typecheck çalıştırıldı.
- Electron, build/package, commit veya push çalıştırılmadı.

Eklenen dosyalar:

- `apps/desktop/src/application/orchestration/OrchestrationRepository.ts`
- `apps/desktop/src/application/orchestration/OrchestrationPersistenceError.ts`
- `apps/desktop/src/application/orchestration/PersistedOrchestration.ts`
- `apps/desktop/src/main/persistence/AtomicFileWriter.ts`
- `apps/desktop/src/main/orchestration/OrchestrationStorageLocation.ts`
- `apps/desktop/src/main/orchestration/orchestrationRecord.ts`
- `apps/desktop/src/main/orchestration/JsonOrchestrationRepository.ts`
- `apps/desktop/src/main/orchestration/createOrchestrationRepository.ts`
- `apps/desktop/tests/orchestration-persistence.test.cjs`

Güncellenen dosyalar: `apps/desktop/tsconfig.node.json` (application katmanını typecheck'e dahil eder) ve bu mimari belge. Aşağıdaki liste önceki domain geliştirmesine aittir.

## Değişen dosyalar

Yeni:

- `apps/desktop/src/domain/orchestration/models.ts`
- `apps/desktop/src/domain/orchestration/events.ts`
- `apps/desktop/src/domain/orchestration/OrchestrationError.ts`
- `apps/desktop/src/domain/orchestration/taskGraph.ts`
- `apps/desktop/src/domain/orchestration/Orchestration.ts`
- `apps/desktop/src/domain/orchestration/index.ts`
- `apps/desktop/tsconfig.domain.json`
- `apps/desktop/tests/orchestration-domain.test.cjs`
- `apps/desktop/tests/types/orchestration.typecheck.ts`
- Bu mimari/doğrulama belgesi.

Güncellenen: `apps/desktop/package.json` — yalnız typecheck komutuna domain kontrolü eklendi; bağımlılıklar değişmedi.
