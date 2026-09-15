# Phase 2C — Conversation worktree isolation

## Davranış

İlk prompt, main process tarafından doğrulanan local base branch'ten ayrı bir `flux/<16-hex-conversation-id>` branch'i ve worktree oluşturur. Branch adı kullanıcı girdisinden türetilmez. Ortak Git dizininin canonical yolu üzerinden repository kilidi uygulanır; aynı repoya bağlı checkout'lar aynı kilidi paylaşır. Git ayrı argv ile `execFile`, `shell: false` üzerinden çalışır. Hooks ve fsmonitor kapatılır; ana checkout'a switch/checkout uygulanmaz.

Conversation JSON kaydında baseBranch, workBranch, worktreePath, worktreeStatus ve worktreeCreatedAt tutulur. Oluşturma niyeti ve kullanıcı mesajı model turn'ünden önce atomik kaydedilir. Worktree hazır olmadan agent başlatılmaz. Başarılı worktree oluşumundan sonraki JSON yazımı başarısız olursa mevcut creating kaydı aynı worktree'yi doğrulayıp kurtarabilir.

Konum `<Flux app-data>/worktrees/<projectId>/<conversationId>` şeklindedir. Geliştirme sürümündeki mevcut `.flux/desktop` kayıtları taşınmaz; worktree'ler işletim sistemindeki Flux app-data alanında tutulur. Windows paketli host'ların AppData yönlendirmesi canonical yol çözümlemesiyle desteklenir. Çözülen yolun ana repository dışında olduğu doğrulanır; proje alt klasöründeki symlink/junction yönlendirmeleri reddedilir.

Eski conversation ilk follow-up öncesinde kayıtlı base branch üzerinden taşınır. Codex thread kimliği korunur. Process, thread/start veya thread/resume ve her turn/start aynı worktree cwd'sini kullanır. Eski HEAD eşleşme zorunluluğu kaldırılmıştır. Sandbox readOnly, networkAccess false ve approvalPolicy never kalır.

Context bar çalışma branch'ini, `Isolated` etiketini ve `Based on <baseBranch>` tooltip'ini gösterir. Başlamış conversation'ın branch seçimi kilitlidir. Eksik/başka branch'e geçmiş worktree güvenli hata üretir; ana repo üzerinde çalışma veya sessiz worktree yeniden oluşturma yapılmaz.

## Gerçek Electron doğrulaması

- Ana checkout: `feature/worktree-isolation`; seçilen base: `main`.
- Gerçek model cevabı: `Hello from isolated Lead.`
- Oluşturulan worktree'nin HEAD'i seçili base commit ile eşleşti.
- Process spawn, thread/start ve turn/start cwd değerleri worktree ile eşleşti.
- Electron kapatılıp açıldı; sidebar'dan conversation geri yüklendi.
- Follow-up, thread/resume ile aynı thread ve aynı worktree üzerinde aynı cevabı verdi.
- Ana repo HEAD, aktif branch, kaynak dosya hash'leri ve Git status değişmedi.
- İzole worktree çalışma dosyaları da temiz kaldı.
- Görseller: `.cache/isolated-conversation-created.png`, `.cache/isolated-conversation-resumed.png`.

## Otomatik kontroller

- `node --test --test-concurrency=1 apps/desktop/tests/*.test.cjs`: **133 başarılı, 0 başarısız**.
- Yeni worktree testleri: farklı base branch, repository kilidi, invalid/remote branch, güvenli cleanup, değiştirilmiş dosyaların korunması, eksik/retargeted worktree, creating recovery, AppData virtualization, junction engeli, legacy migration ve aynı thread/cwd ile restart.
- `pnpm test` paralel çalıştırmasında mevcut runtime-state testlerinden biri aralıklı başarısız oldu; aynı tam test kümesi seri çalıştırmada geçti. Runtime-state uygulama/test kodu değiştirilmedi.
- `pnpm typecheck`, `pnpm build`, `git diff --check`: başarılı.

## Değişen dosyalar

Yeni:

- `apps/desktop/src/main/chat/ConversationWorktreeService.ts`
- `apps/desktop/src/main/projects/GitCommandRunner.ts`
- `apps/desktop/tests/conversation-worktree.test.cjs`
- Bu doğrulama raporu.

Güncellenen:

- `AGENTS.md`
- `apps/desktop/src/main/projects/GitRepositoryService.ts`
- `apps/desktop/src/main/chat/ConversationRepository.ts`
- `apps/desktop/src/main/chat/SingleAgentRunService.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/app-server/CodexChatSession.ts`
- `apps/desktop/src/main/app-server/contracts.ts`
- `apps/desktop/src/shared/conversation-api.ts`
- `apps/desktop/src/renderer/components/composer/ComposerContextBar.tsx`
- `apps/desktop/src/renderer/components/shared/SelectorButton.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/tests/conversation-history.test.cjs`
- `apps/desktop/tests/single-agent-chat.test.cjs`
- `apps/desktop/tests/project-services.test.cjs`

## Sınırlar

Cleanup yalnız mevcut oluşturma denemesinde compare-and-swap ile rezerve edilen Flux ref'i üzerinde yapılır. Temiz ve doğrulanmış worktree force kullanılmadan kaldırılır; branch yalnız beklenen commit hâlâ aynıysa silinir. Değişmiş dosyalar, başka worktree kayıtları veya belirsiz sahiplik durumunda varlıklar korunur. Ani kapanmanın yalnız branch oluşturulduğu ara noktasında bıraktığı belirsiz kaynaklar otomatik silinmez.

Worktree silme UI'ı, agent dosya yazma, multi-agent veya task decomposition eklenmedi. Ana repoda package, commit, merge veya push yapılmadı. Testlerin fixture repository'leri yalnız `.cache` altında oluşturuldu.
