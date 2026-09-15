import type { AgentAvatar as Avatar, BuiltinAgentIcon } from '../../../shared/management-api';
import { useAgentAvatar } from '../../hooks/useAgentAvatar';
import { Icon, type IconName } from '../shared/Icon';
const icons: Record<BuiltinAgentIcon, IconName> = { robot: 'agents', terminal: 'terminal', code: 'code', search: 'search', shield: 'shield', 'test-tube': 'testTube', 'git-branch': 'branch', database: 'database' };
export function AgentAvatar({ avatar, size = 30 }: { avatar: Avatar; size?: number }) { const { url, error } = useAgentAvatar(avatar.type === 'image' ? avatar.assetId : null); return <span className="agent-avatar" style={{ width: size, height: size }} title={error ?? undefined}>{avatar.type === 'image' && url ? <img src={url} alt="" /> : <Icon name={avatar.type === 'builtin' ? icons[avatar.value] : 'agents'} size={Math.round(size * .6)} />}</span>; }
