import { useEffect, useState } from 'react';
import { unwrap, errorMessage } from './management-api';
export function useAgentAvatar(assetId: string | null) {
 const [image, setImage] = useState<{ id: string; url: string } | null>(null); const [error, setError] = useState<string | null>(null);
 useEffect(() => { let alive = true; setError(null); if (assetId) void window.flux.getAgentAvatarDataUrl(assetId).then(unwrap).then(url => { if (alive) setImage({ id: assetId, url }); }).catch(cause => { if (alive) setError(errorMessage(cause)); }); return () => { alive = false; }; }, [assetId]);
 return { url: image?.id === assetId ? image.url : null, error };
}
