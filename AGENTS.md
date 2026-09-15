# Flux çalışma kuralları

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
