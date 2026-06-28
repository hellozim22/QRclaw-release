/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadImageUrl } from '@/lib/download-image';

describe('downloadImageUrl', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses blob download for data:image/png;base64 URLs', async () => {
    const origCreate = document.createElement.bind(document);
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        el.click = clickSpy as typeof el.click;
      }
      return el;
    });

    await downloadImageUrl('data:image/png;base64,AA==', 'out.png');

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
