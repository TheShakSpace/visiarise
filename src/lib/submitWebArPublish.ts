import { apiFetch, apiUrl } from './api';
import type { StudioPublishOptions } from '../components/studio/StudioPublishDialog';

export async function submitWebArPublish(
  projectId: string,
  glbBuffer: ArrayBuffer,
  opts: StudioPublishOptions,
  token: string
): Promise<void> {
  const res = await fetch(apiUrl(`/api/projects/${projectId}/ar-glb`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: glbBuffer,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  await apiFetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({
      arSharePublic: opts.arSharePublic,
      arPageTitle: opts.arPageTitle,
      arPageTagline: opts.arPageTagline,
      arCtaLabel: opts.arCtaLabel,
      arAccentHex: opts.arAccentHex,
      status: 'published',
    }),
  });
}
