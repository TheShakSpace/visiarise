import { apiFetch, type MeshyTaskPayload, type MeshyTaskStatusResponse } from './api';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function pollMeshyTask(
  taskId: string,
  token: string,
  opts?: { onProgress?: (pct: number) => void; maxAttempts?: number }
): Promise<MeshyTaskPayload> {
  const maxAttempts = opts?.maxAttempts ?? 100;
  for (let i = 0; i < maxAttempts; i++) {
    const { task } = await apiFetch<MeshyTaskStatusResponse>(`/api/meshy/task/${encodeURIComponent(taskId)}`, {
      token,
    });
    if (typeof task.progress === 'number') {
      opts?.onProgress?.(Math.min(100, Math.max(0, task.progress)));
    }
    if (task.status === 'SUCCEEDED' || task.status === 'FAILED') {
      if (task.status === 'FAILED') {
        throw new Error(task.errorMessage || 'Meshy generation failed');
      }
      opts?.onProgress?.(100);
      return task;
    }
    await sleep(2500);
  }
  throw new Error('Meshy task timed out — try again or check your Meshy dashboard.');
}

/** After preview succeeds, backend auto_refine sets linkedRefineTaskId on the preview document. */
export async function waitForLinkedRefineTask(previewTaskId: string, token: string, maxAttempts = 120): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const { task } = await apiFetch<MeshyTaskStatusResponse>(`/api/meshy/task/${encodeURIComponent(previewTaskId)}`, {
      token,
    });
    if (task.autoRefineError) {
      throw new Error(task.autoRefineError);
    }
    if (task.linkedRefineTaskId) {
      return task.linkedRefineTaskId;
    }
    await sleep(2500);
  }
  throw new Error('Timed out waiting for automatic texturing to start — check credits and try refine manually.');
}
