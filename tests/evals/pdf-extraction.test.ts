import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));

import { extractText, PDF_TYPE } from '../../lib/evals/storage/text';

function fakeProcess(output: string) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  setImmediate(() => {
    child.stdout.end(output);
    child.emit('close', 0);
  });
  return child;
}

describe('bounded PDF extraction command', () => {
  beforeEach(() => mocks.spawn.mockReset());

  it('streams Poppler output to stdout and preserves page anchors', async () => {
    mocks.spawn.mockImplementation((command: string) => fakeProcess(
      command === 'pdfinfo' ? 'Pages: 1\n' : '30 day refund policy.\f',
    ));

    const result = await extractText(Buffer.from('%PDF synthetic fixture'), PDF_TYPE);

    expect(mocks.spawn).toHaveBeenNthCalledWith(1, 'pdfinfo', ['-'], expect.objectContaining({ shell: false }));
    expect(mocks.spawn).toHaveBeenNthCalledWith(2, 'pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], expect.objectContaining({ shell: false }));
    expect(result.extractionVersion).toBe('pdf-text-v1');
    expect(result.chunks.map(chunk => chunk.excerpt).join('')).toBe('Page 1:\n30 day refund policy.');
  });

  it('rejects scanned PDFs with no extractable text', async () => {
    mocks.spawn.mockImplementation((command: string) => fakeProcess(
      command === 'pdfinfo' ? 'Pages: 1\n' : '\f',
    ));
    await expect(extractText(Buffer.from('%PDF synthetic scan'), PDF_TYPE)).rejects.toThrow();
  });
});
