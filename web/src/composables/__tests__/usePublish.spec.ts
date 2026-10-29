import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
import { useDocStore } from '../../stores/doc';
import { usePublish } from '../usePublish';
const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('../useConfirm', () => ({ useConfirm: () => ({ confirm }) }));
let doc: ReturnType<typeof useDocStore>;
beforeEach(() => {
  vi.restoreAllMocks(); confirm.mockReset(); setActivePinia(createPinia());
  useAuthStore().user = { id: 2 } as any; doc = useDocStore();
  doc.doc.articles = [{ id: 'a', title: '标题', content: '本地草稿', summary: '', category: '小说正文', orgIds: [], charIds: [], shareId: 's', shareRev: 1, visibility: 'private', wordCount: 4, createdAt: 1, updatedAt: 1 }];
});
it('retains the local draft and old revision when an author cancels after seeing a newer cloud version', async () => {
  vi.spyOn(api, 'createShare').mockRejectedValue(new ApiError('conflict', 409));
  vi.spyOn(api, 'getShareDetail').mockResolvedValue({ share: { id: 's', userId: 2, rev: 2, title: '标题', content: '管理员修改' } as any });
  confirm.mockResolvedValue(false);
  expect(await usePublish().publishEntity('article', 'a')).toBeNull();
  expect(doc.doc.articles[0]!.content).toBe('本地草稿'); expect(doc.doc.articles[0]!.shareRev).toBe(1);
  expect(api.createShare).toHaveBeenCalledTimes(1);
  expect(confirm.mock.calls[0]![1]).toContain('管理员修改'); expect(confirm.mock.calls[0]![1]).toContain('本地草稿');
});
it('only retries with the reviewed revision after explicit confirmation', async () => {
  const create = vi.spyOn(api, 'createShare').mockRejectedValueOnce(new ApiError('conflict', 409)).mockResolvedValueOnce({ share: { id: 's', rev: 3 } as any });
  vi.spyOn(api, 'getShareDetail').mockResolvedValue({ share: { id: 's', userId: 2, rev: 2, title: '标题', content: '管理员修改' } as any });
  confirm.mockResolvedValue(true);
  await usePublish().publishEntity('article', 'a');
  expect(create.mock.calls[1]![0].baseRev).toBe(2); expect(doc.doc.articles[0]!.shareRev).toBe(3);
});
it('does not silently recreate a deleted cloud share and preserves the local content', async () => {
  vi.spyOn(api, 'createShare').mockRejectedValue(new ApiError('deleted', 404));
  expect(await usePublish().publishEntity('article', 'a')).toBeNull();
  expect(api.createShare).toHaveBeenCalledTimes(1);
  expect(doc.doc.articles[0]!.shareId).toBeUndefined(); expect(doc.doc.articles[0]!.content).toBe('本地草稿');
});
