import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth';
import { useAIStore } from '../ai';
import { api } from '../../data/api';

beforeEach(() => { setActivePinia(createPinia()); useAuthStore().user = { id: 2 } as any; });
describe('AI drafts protect the target and require explicit application', () => {
  it('does not mutate before apply and blocks a changed or deleted target', async () => {
    const ai = useAIStore(); let current: string | undefined = 'original';
    const apply = vi.fn((text, mode) => { current = mode === 'append' ? current + text : text; });
    const done = ai.requestDraft({ task: 'article_write' }, { title: 'Draft', currentValue: () => current, apply });
    expect(current).toBe('original'); expect(apply).not.toHaveBeenCalled();
    current = 'edited'; expect(() => ai.applyDraft('generated', 'replace')).toThrow('目标内容已修改');
    expect(ai.draft).not.toBeNull();
    current = undefined; expect(() => ai.applyDraft('generated', 'append', true)).toThrow('创作目标已删除');
    current = 'edited'; ai.applyDraft('generated', 'append', true);
    expect(current).toBe('editedgenerated'); expect(await done).toBe(true);
  });
  it('blocks stale summaries when their source article changed', () => {
    const ai = useAIStore(); let body = 'old body'; const apply = vi.fn();
    void ai.requestDraft({ task: 'article_summary' }, { title: 'Summary', currentValue: () => 'summary', sourceValue: () => body, apply });
    body = 'new body'; expect(ai.draftChanged).toBe(true);
    expect(() => ai.applyDraft('stale summary', 'replace')).toThrow('目标内容已修改');
    expect(apply).not.toHaveBeenCalled(); ai.closeDraft();
  });
  it('discard closes without applying and clearLocal removes private preferences', async () => {
    const ai = useAIStore(), apply = vi.fn();
    const done = ai.requestDraft({ task: 'field_gen' }, { title: 'Draft', currentValue: () => 'old', apply });
    ai.preferences.aiCustomInstruction = 'private'; ai.clearLocal();
    expect(await done).toBe(false); expect(apply).not.toHaveBeenCalled(); expect(ai.preferences.aiCustomInstruction).toBe('');
  });
  it('keeps explicit personal provider instead of falling back to public quota', async () => {
    const ai = useAIStore(); ai.activeProvider = 'custom';
    const spy = vi.spyOn(api, 'generateAI').mockRejectedValueOnce(new Error('no personal key'));
    await expect(ai.generate({ task: 'article_write' })).rejects.toThrow('no personal key');
    expect(spy.mock.calls[0]![0].provider).toBe('custom'); spy.mockRestore();
  });
});
