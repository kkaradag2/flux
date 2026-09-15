import { useState } from 'react';
import type { AgentAvatar as Avatar } from '../../../shared/management-api';
import { AgentAvatar } from './AgentAvatar';
import { BuiltinIconGrid } from './BuiltinIconGrid';
import { AvatarImageUploader } from './AvatarImageUploader';
export function AgentAvatarPicker({ value, onChange }: { value: Avatar; onChange: (value: Avatar) => void }) {
 const [open, setOpen] = useState(false);
 return <section className="avatar-picker"><span className="field-label">Avatar</span><button type="button" className="avatar-preview-button" aria-label="Choose agent avatar" aria-expanded={open} onClick={() => setOpen(!open)}><AgentAvatar avatar={value} size={44} /><span>Change avatar</span></button>{open && <div className="avatar-options"><p className="field-label">Built-in icons</p><BuiltinIconGrid value={value} onChange={onChange} /><AvatarImageUploader onSelected={assetId => onChange({ type: 'image', assetId })} /></div>}</section>;
}
