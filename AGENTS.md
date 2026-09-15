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

Mevcut tasarım ve prompt davranışları korunur. Prompt seçimleri yalnızca Project, Environment ve Branch içerir; runtime agent tanımına aittir. Sağdaki TeamPanel sabit Core Team özetidir: Lead, Developer, Reviewer ve Tester; her birinin runtime değeri Codex. Typed dizi TeamMemberRow bileşenleriyle render edilir. Agent ekleme/çıkarma, editor, runtime selector veya takım oluşturma geliştirilmez.

WorkspaceContext ve sidebar hook ayrımı korunur. TypeScript strict korunur; any kullanılmaz. Proje ve local branch seçimi için typed preload API ve main process servisleri kullanılır. JSON kayıtları userData altında ProjectRepository arkasında tutulur. Git yalnızca execFile ile okunur; checkout/switch çalıştırılmaz. Otomatik başlangıç projesi yalnızca C:\WorkSpace\AI\Flux olabilir. Commit veya push yapılmaz; sonraki aşamaya geçilmez.
