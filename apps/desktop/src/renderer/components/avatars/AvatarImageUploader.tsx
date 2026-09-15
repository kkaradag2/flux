import { useState } from 'react';
import { unwrap, errorMessage } from '../../hooks/management-api';
export function AvatarImageUploader({ onSelected }: { onSelected: (id: string) => void }) {
 const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
 const upload = async (): Promise<void> => { setLoading(true); setError(null); try { const id = unwrap(await window.flux.selectAgentAvatarImage()); if (id) onSelected(id); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); } };
 return <div><button type="button" className="agent-button" disabled={loading} onClick={() => void upload()}>{loading ? 'Opening…' : 'Upload image'}</button><p className="field-help">PNG, JPG, JPEG or WebP · Up to 2 MB</p>{error && <p className="workspace-error" role="alert">{error}</p>}</div>;
}
