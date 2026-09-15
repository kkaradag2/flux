# Flux çalışma kuralları

Phase 2B istisnası: Tek-agent conversation kayıtları main process ConversationRepository arkasında app-data JSON dosyalarına atomik yazılır. Kullanıcı mesajı ve Codex thread kimliği çalıştırmadan önce, partial yanıtlar aralıklı ve terminal durumda kaydedilir. Codex thread kalıcıdır; kayıtlı kimlikle thread/resume kullanılır, bulunamazsa sessizce yeni thread açılmaz. Agent adı/avatarı ve çalışma ayarları oluşturma snapshot'ından gelir. Sidebar gerçek proje geçmişini gösterir. Conversation silme, arama, rename, multi-agent, SQLite ve proje dosyası yazma yoktur.

Phase 2A istisnası: Workspace composer seçili team'in ilk enabled agent'ını resmi App Server üzerinde çalıştırabilir. Kayıtlı proje/agent ayarları main process'te çözülür; renderer yalnız projectId, branch, teamId ve prompt gönderir. Her turn öncesi gerçek HEAD eşleşmesi gerekir. never approval, readOnly sandbox ve kapalı tool network zorunludur. Conversation ephemeral ve yalnız bellektedir; follow-up aynı thread'i kullanır, New task temizler. Multi-agent, dosya yazma, checkout/worktree ve conversation persistence yoktur.

- Yalnızca `C:\WorkSpace\AI\Flux` altında çalış. Bu dizinin dışındaki projeleri kendiliğinden tarama veya değiştirme. Uygulama yalnızca kullanıcının native picker ile seçtiği klasörleri inceleyebilir. Özellikle Recallio ve diğer projelere dokunma.
- Kullanıcı talebinin dışına çıkma.
- Büyük değişiklikleri küçük ve doğrulanabilir adımlara böl.
- Bir bağımlılık eklemeden önce neden gerekli olduğunu belirt.
- Controller, UI veya altyapı içinde iş kurallarını yığma.
- Domain ve entegrasyon katmanlarını birbirinden ayır.
- Mastra, Coldstart, Codex ve ACP gibi ürünlere veya protokollere doğrudan bağımlılığı adapter arkasında tut.
- Kullanıcının açık onayı olmadan commit veya push yapma.
- Her geliştirme sonunda değişen dosyaları ve doğrulama sonuçlarını raporla.

## Güncel aşama sınırı

Agents ve Teams yönetimi ayrı liste/create/edit ekranlarından yürütülür. Ortak typed modeller shared katmandadır. JSON ve avatar dosyaları yalnızca main process içinde repository/service arkasından Electron userData altında yönetilir; renderer typed window.flux API kullanır. Avatar içeriği JSON'a yazılmaz. Markdown preview ham HTML çalıştırmaz.

WorkspaceContext ve mevcut proje/branch servisleri korunur. Team seçimi workspace taslağındadır; proje default team kaydı veya request persistence eklenmez. Agent runtime tanımın parçasıdır, prompt ayarı değildir. Agent/team silme, gerçek agent yürütme, Git checkout/worktree, Mastra, Coldstart, ACP veya SQLite eklenmez. Strict TypeScript ve bileşen ayrımı korunur. Commit/push yapılmaz ve sonraki aşamaya geçilmez.

Codex runtime sağlık kontrolü RuntimeCommandRunner / CodexRuntimeProbe / RuntimeHealthService ayrımında tutulur. Sadece executable tespiti, --version ve login status çalıştırılır. Credential dosyası okunmaz, ham çıktı renderer'a taşınmaz, prompt/agent yürütülmez. Settings health hook'u workspace ve agent state'inden ayrıdır.

Phase 1A istisnası: Settings'ten yalnızca sabit hello prompt'u resmi Codex App Server stdio/JSONL üzerinden çalıştırılır. Ephemeral thread, never approval ve read-only sandbox zorunludur; model/effort override edilmez. Workspace prompt'u, agent instruction'ları ve teams yürütmeye bağlanmaz. App Server transport/client/service yalnızca main process'tedir. Yeni bağımlılık, CLI/SDK/ACP kurulumu veya global Codex ayarı değişikliği yapılmaz.

Phase 1B: Runtime operasyonel durumu main process repository arkasında app data JSON dosyasında saklanır. Aynı sürüm/auth için kayıtlı doğrulama sonucu ekran geçişinde ve yeniden açılışta korunur. İlk veya geçersizleşen sonuç otomatik sabit hello doğrulaması yapar; Ready yalnızca başarılı gerçek doğrulama anlamına gelir. Settings'te teknik Refresh/Run test kontrolleri yerine duruma uygun eylemler kullanılır. Yalnız typed CLI_TOO_OLD güncelleme eylemi üretir. Kullanıcının uygulama içi onayından sonra, tek ve doğrulanmış npm global kurulumu için sabit npm güncellemesi yapılabilir. Çoklu/bilinmeyen kurulumda otomatik güncelleme yapılmaz; auth/config dosyaları değiştirilmez, yönetici yetkisi istenmez. Phase 1A'nın güncelleme yasağı yalnızca bu kontrollü akış için kaldırılmıştır.

Phase 1C: Çoklu kurulumda önce açık kullanıcı seçimi gerekir. Renderer yalnız main allowlist candidate ID'sini gönderir. Seçim ayrı app data repository'sinde kalıcıdır; bütün runtime işlemleri ortak seçilen executable resolver'ını kullanır. Seçim kaybolursa başka PATH adayına otomatik dönülmez. Seçilen npm kurulumunun owning prefix'i doğrulanınca sabit paket yalnız o prefix'e ayrı argv ile güncellenebilir; bunun için çoklu kurulum engeli kaldırılmıştır. PATH, diğer kurulum, auth ve config dosyaları değiştirilmez. Gerçek executable yolları yalnız yerel seçim ekranında ve özel seçim kaydında bulunabilir; log, rapor veya dış servislere taşınmaz.
