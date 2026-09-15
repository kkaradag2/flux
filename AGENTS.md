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

Phase 0 tamamlandı. Kullanıcının güncel talebi kapsamında `apps/desktop` altında Electron Forge, Vite, React ve TypeScript masaüstü iskeleti kurulabilir ve çalıştırılabilir. Main, preload ve renderer ayrı tutulur; `contextIsolation=true`, `nodeIntegration=false` kullanılır. Arayüz yalnızca “Flux” başlığını gösterir. Mastra, Coldstart, SQLite ve ACP kurulmaz. Commit atılmaz; sonraki aşamaya kendiliğinden geçilmez.
