# Agents ve Teams — doğrulama raporu

## Sonuç

Agents / Teams liste, create ve edit ekranları; typed IPC; JSON repository/service katmanı; avatar yükleme; güvenli Markdown preview ve workspace takım seçimi tamamlandı. Mevcut proje/branch seçimi ve önceki UI düzenlemeleri korundu. Commit/push yapılmadı.

## Bağımlılıklar

- react-markdown 10.1.0: ham HTML çalıştırmadan Markdown preview.
- remark-gfm 4.0.1: checklist ve tablo dahil GitHub Flavored Markdown desteği.

Yeni router, UI framework, WYSIWYG, database veya runtime bağımlılığı eklenmedi.

## Komut sonuçları

- pnpm typecheck: başarılı.
- pnpm test: 13 test geçti, 0 hata (11 management alt testi, management grubu ve mevcut project/branch testi).
- pnpm build: main, preload ve renderer production build başarılı.
- pnpm package: Windows x64 Forge paketi başarılı.
- git diff --check: başarılı.
- Electron: pencere açıldı; altı ekran görüntüsü alındı, son ekran kontrolünde renderer exception/console error görülmedi.

## Repository/service doğrulaması

Default seed yalnızca eksik/boş kayıtta; agent create/update; trim; değiştirilemeyen ID/createdAt; runtime/reasoning doğrulaması; team create/update, üye sırası, tekrar/bilinmeyen ID/boş üyelik reddi; yeniden açılışta kayıt; bozuk JSON'un korunması; eşzamanlı yazım; başarısız atomik rename sonrası önceki verinin korunması test edildi.

Avatar testlerinde PNG kabulü, desteklenmeyen uzantı, bozuk içerik, 2 MB üzeri dosya, path traversal ve JSON içinde kaynak yol/base64 bulunmaması doğrulandı. Native Electron picker üzerinden görsel yüklendi; gerçek decoder, data URL görüntüsü ve yeniden açılışta avatar doğrulandı. 2 MB üzeri dosyanın UI hatası kontrol edildi.

## UI doğrulaması

- Agents / Teams tab'ları, ayrı list → edit → geri akışları.
- New agent / New team, Save / Cancel ve değişiklik yokken disabled Save.
- Geri/Cancel sırasında uygulama içi unsaved dialog, Keep editing ve Discard.
- Built-in avatar seçimi ve native image picker.
- Markdown Edit/Preview: başlık, liste/checklist, tablo, blockquote, inline code, code block. Ham script/HTML çalışmadı.
- Team add/remove, yukarı/aşağı sıra, Disabled üye görünümü.
- Core Team edit ve agent avatar değişikliği workspace'e hemen yansıdı.
- Workspace team selector, ekranlar arasında mesaj/taslak/proje/branch/team korunması.
- Agent ve team gerçek Electron yeniden açılışından sonra korundu. Workspace team seçimi tasarım gereği oturumluk.
- 900 ve 600 px genişliklerde editor taşması kontrol edildi. Listeler gerektiğinde kendi yatay scroll alanını kullanır.

UI doğrulama kayıtları kaldırıldı; test öncesi Lead avatarı ve Core Team sırası geri getirildi. Uygulamaya ait test dosyaları yalnızca Flux altındaki .cache içinde tutuldu.

## Kapsam ve sorunlar

Çözümlenmemiş blocker yok. Native file picker'ın Windows kontrol ID'si klasör picker'dan farklıydı; doğrulama otomasyonu buna göre düzeltildi. Toplu yedek geri yükleme komutu otomatik onay denetiminde reddedildi (araç yalnızca "blocked by policy" bildirdi); bunun yerine kimliği/içeriği kontrol edilen test kayıtlarına hedefli temizlik uygulandı.

Avatarlar en fazla 2 MB ve 4096 × 4096 olarak doğrulanır. Silme/asset garbage collection bu aşamada yoktur; kaydetmeden vazgeçilen yüklemeler asset klasöründe kalabilir. Preview bağlantı/görselleri dış kaynak açmaz. Gerçek agent yürütme, request persistence, proje default team kaydı, checkout/worktree eklenmedi.

## Değişen ve eklenen dosyalar

Aşağıdaki liste bu çalışma alanının mevcut diff'ini kapsar; önceki UI aşamasının değişiklikleri korunarak genişletilmiştir. Statik core-team.ts ve önceki local preview agent modeli/Instructions bileşeni kalıcı shared model ve Markdown bileşenleriyle değiştirildi.
- `AGENTS.md`
- `apps/desktop/index.html`
- `apps/desktop/package.json`
- `apps/desktop/scripts/build.mjs`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/management/AgentAssetService.ts`
- `apps/desktop/src/main/management/AgentRepository.ts`
- `apps/desktop/src/main/management/AgentService.ts`
- `apps/desktop/src/main/management/defaults.ts`
- `apps/desktop/src/main/management/JsonAgentRepository.ts`
- `apps/desktop/src/main/management/JsonStore.ts`
- `apps/desktop/src/main/management/JsonTeamRepository.ts`
- `apps/desktop/src/main/management/ManagementError.ts`
- `apps/desktop/src/main/management/registerManagementIpc.ts`
- `apps/desktop/src/main/management/TeamRepository.ts`
- `apps/desktop/src/main/management/TeamService.ts`
- `apps/desktop/src/main/management/validation.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/agents/AgentCreateScreen.tsx`
- `apps/desktop/src/renderer/components/agents/AgentEditor.tsx`
- `apps/desktop/src/renderer/components/agents/AgentEditorActions.tsx`
- `apps/desktop/src/renderer/components/agents/AgentEditScreen.tsx`
- `apps/desktop/src/renderer/components/agents/AgentEnabledToggle.tsx`
- `apps/desktop/src/renderer/components/agents/AgentGeneralFields.tsx`
- `apps/desktop/src/renderer/components/agents/AgentList.tsx`
- `apps/desktop/src/renderer/components/agents/AgentListItem.tsx`
- `apps/desktop/src/renderer/components/agents/AgentRuntimeFields.tsx`
- `apps/desktop/src/renderer/components/agents/AgentsHeader.tsx`
- `apps/desktop/src/renderer/components/agents/AgentsScreen.tsx`
- `apps/desktop/src/renderer/components/agents/AgentStatus.tsx`
- `apps/desktop/src/renderer/components/avatars/AgentAvatar.tsx`
- `apps/desktop/src/renderer/components/avatars/AgentAvatarPicker.tsx`
- `apps/desktop/src/renderer/components/avatars/AvatarImageUploader.tsx`
- `apps/desktop/src/renderer/components/avatars/BuiltinIconGrid.tsx`
- `apps/desktop/src/renderer/components/management/ManagementArea.tsx`
- `apps/desktop/src/renderer/components/management/UnsavedChangesDialog.tsx`
- `apps/desktop/src/renderer/components/markdown/MarkdownEditorTabs.tsx`
- `apps/desktop/src/renderer/components/markdown/MarkdownInstructionEditor.tsx`
- `apps/desktop/src/renderer/components/markdown/MarkdownPreview.tsx`
- `apps/desktop/src/renderer/components/shared/Icon.tsx`
- `apps/desktop/src/renderer/components/shared/SelectorButton.tsx`
- `apps/desktop/src/renderer/components/sidebar/AppSidebar.tsx`
- `apps/desktop/src/renderer/components/sidebar/SidebarNavigation.tsx`
- `apps/desktop/src/renderer/components/team/TeamMemberRow.tsx`
- `apps/desktop/src/renderer/components/team/TeamPanel.tsx`
- `apps/desktop/src/renderer/components/teams/AvailableAgentList.tsx`
- `apps/desktop/src/renderer/components/teams/AvailableAgentRow.tsx`
- `apps/desktop/src/renderer/components/teams/TeamCreateScreen.tsx`
- `apps/desktop/src/renderer/components/teams/TeamEditor.tsx`
- `apps/desktop/src/renderer/components/teams/TeamEditScreen.tsx`
- `apps/desktop/src/renderer/components/teams/TeamList.tsx`
- `apps/desktop/src/renderer/components/teams/TeamListItem.tsx`
- `apps/desktop/src/renderer/components/teams/TeamMemberList.tsx`
- `apps/desktop/src/renderer/components/teams/TeamMemberRow.tsx`
- `apps/desktop/src/renderer/components/teams/TeamsHeader.tsx`
- `apps/desktop/src/renderer/components/teams/TeamsScreen.tsx`
- `apps/desktop/src/renderer/components/WorkspaceScreen.tsx`
- `apps/desktop/src/renderer/data/core-team.ts`
- `apps/desktop/src/renderer/hooks/management-api.ts`
- `apps/desktop/src/renderer/hooks/useAgentAvatar.ts`
- `apps/desktop/src/renderer/hooks/useAgentEditor.ts`
- `apps/desktop/src/renderer/hooks/useAgents.ts`
- `apps/desktop/src/renderer/hooks/useEditorDraft.ts`
- `apps/desktop/src/renderer/hooks/useTeamEditor.ts`
- `apps/desktop/src/renderer/hooks/useTeams.ts`
- `apps/desktop/src/renderer/state/ManagementContext.tsx`
- `apps/desktop/src/renderer/state/NavigationContext.tsx`
- `apps/desktop/src/renderer/state/WorkspaceContext.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/shared/management-api.ts`
- `apps/desktop/src/shared/management-channels.ts`
- `apps/desktop/src/shared/project-api.ts`
- `apps/desktop/tests/management.test.cjs`
- `package.json`
- `pnpm-lock.yaml`
- `README.md`

## Ekran görüntüleri

- [Agent listesi](C:/WorkSpace/AI/Flux/.cache/management-agents-list.png)
- [Agent edit](C:/WorkSpace/AI/Flux/.cache/management-agent-edit.png)
- [Markdown preview](C:/WorkSpace/AI/Flux/.cache/management-markdown-preview.png)
- [Teams listesi](C:/WorkSpace/AI/Flux/.cache/management-teams-list.png)
- [Team edit](C:/WorkSpace/AI/Flux/.cache/management-team-edit.png)
- [Workspace](C:/WorkSpace/AI/Flux/.cache/management-workspace.png)

