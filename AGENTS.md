# Flux çalışma kuralları

- Yalnızca `C:\WorkSpace\AI\Flux` altında çalış. Bu dizinin dışındaki hiçbir dosyayı veya projeyi okuma, değiştirme ya da tarama. Özellikle Recallio ve diğer projelere dokunma.
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

WorkspaceContext ve sidebar hook ayrımı korunur. TypeScript strict korunur; any kullanılmaz. Electron IPC veya gerçek entegrasyon eklenmez. Commit veya push yapılmaz; sonraki aşamaya geçilmez.
