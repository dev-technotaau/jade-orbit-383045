/**
 * Tests for the inbound-media proxy (src/services/whatsapp-media.service.ts).
 *
 * What matters here is that the response is a STREAM with working byte ranges.
 * The proxy used to read the whole object into a Buffer and `res.send()` it,
 * which meant a 100 MB attachment sat in the Node heap once per concurrent
 * viewer and the browser could not seek at all — a scrubber drag on a customer's
 * video did nothing until the last byte arrived. So the assertions below are
 * about headers and plumbing: `Accept-Ranges` is advertised, an inbound `Range`
 * reaches R2/Meta, a 206 is passed back with its `Content-Range`, an
 * unsatisfiable range is a 416 rather than a silent full-body 200, and the
 * buffering helper is never called.
 *
 * Prisma, R2 and Meta are mocked; the response is a real Writable so the actual
 * `pipeline()` runs.
 */
/*
 * fetch / Headers / ReadableStream are how the code under test talks to Meta,
 * so the fakes have to speak the same shapes. eslint-plugin-n calls them
 * experimental below the engines floor; the service does the same for its own
 * fetch call.
 */
/* eslint-disable n/no-unsupported-features/node-builtins */
import { Readable, Writable } from 'stream';
import type { Response } from 'express';

const prismaMock = {
  waMessage: { findFirst: jest.fn() },
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../config/env', () => ({
  env: { META_WHATSAPP_TOKEN: 'test_token' },
}));

jest.mock('../../config/r2', () => ({ r2Client: {} }));

jest.mock('../whatsapp.service', () => ({ graphVersion: () => 'v21.0' }));

const getObjectStreamMock = jest.fn();
const downloadFileFromR2Mock = jest.fn();
jest.mock('../storage.service', () => {
  // A real class, so the service's `instanceof` check behaves as in production.
  class R2RangeNotSatisfiableError extends Error {
    constructor() {
      super('Requested range not satisfiable');
      this.name = 'R2RangeNotSatisfiableError';
    }
  }
  return {
    getObjectStream: getObjectStreamMock,
    downloadFileFromR2: downloadFileFromR2Mock,
    putBufferToR2: jest.fn(),
    R2RangeNotSatisfiableError,
  };
});

import { streamMedia } from '../whatsapp-media.service';
import { R2RangeNotSatisfiableError } from '../storage.service';

/** Minimal Express `Response` stand-in that is also a real Writable sink. */
interface FakeRes extends Writable {
  statusCode: number;
  headersSent: boolean;
  sentHeaders: Record<string, string>;
  jsonBody?: unknown;
  written: Buffer[];
  status(code: number): FakeRes;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  req: { headers: Record<string, string | undefined> };
}

function makeRes(range?: string): FakeRes {
  const written: Buffer[] = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      written.push(Buffer.from(chunk as Uint8Array));
      res.headersSent = true;
      cb();
    },
  }) as FakeRes;
  res.written = written;
  res.sentHeaders = {};
  res.statusCode = 200;
  res.headersSent = false;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.jsonBody = body;
    res.headersSent = true;
  };
  res.setHeader = (name: string, value: string) => {
    res.sentHeaders[name.toLowerCase()] = String(value);
  };
  res.req = { headers: { range } };
  return res;
}

const serve = (res: FakeRes, mediaId = 'MEDIA_1') =>
  streamMedia(mediaId, res as unknown as Response);

/** A fetch Response shaped like the ones undici returns for a media download. */
function metaMediaResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
  };
}

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // Default: the id resolves to a stored message that was archived to R2.
  prismaMock.waMessage.findFirst
    .mockResolvedValueOnce({ id: 'msg_1' })
    .mockResolvedValueOnce({ mediaUrl: 'whatsapp-media/MEDIA_1.mp4', mediaMime: 'video/mp4' });
});

describe('streamMedia — R2 archive', () => {
  it('streams the object and advertises byte ranges', async () => {
    getObjectStreamMock.mockResolvedValue({
      body: Readable.from([Buffer.from('video-bytes')]),
      contentLength: 11,
      contentType: 'video/mp4',
      status: 200,
    });

    const res = makeRes();
    await serve(res);

    expect(getObjectStreamMock).toHaveBeenCalledWith('whatsapp-media/MEDIA_1.mp4', undefined);
    expect(res.statusCode).toBe(200);
    expect(res.sentHeaders['accept-ranges']).toBe('bytes');
    expect(res.sentHeaders['content-type']).toBe('video/mp4');
    expect(res.sentHeaders['content-length']).toBe('11');
    expect(res.sentHeaders['content-range']).toBeUndefined();
    expect(Buffer.concat(res.written).toString()).toBe('video-bytes');
    // The whole point of the change: nothing is read into memory up front.
    expect(downloadFileFromR2Mock).not.toHaveBeenCalled();
  });

  it('forwards the inbound Range to R2 and answers 206 with Content-Range', async () => {
    getObjectStreamMock.mockResolvedValue({
      body: Readable.from([Buffer.from('deo-b')]),
      contentLength: 5,
      contentRange: 'bytes 2-6/11',
      contentType: 'video/mp4',
      status: 206,
    });

    const res = makeRes('bytes=2-6');
    await serve(res);

    expect(getObjectStreamMock).toHaveBeenCalledWith('whatsapp-media/MEDIA_1.mp4', 'bytes=2-6');
    expect(res.statusCode).toBe(206);
    expect(res.sentHeaders['content-range']).toBe('bytes 2-6/11');
    // A 206 must announce the SLICE length, not the object's.
    expect(res.sentHeaders['content-length']).toBe('5');
    expect(Buffer.concat(res.written).toString()).toBe('deo-b');
  });

  it('answers 416 for a range past the end instead of falling back to the full file', async () => {
    getObjectStreamMock.mockRejectedValue(new R2RangeNotSatisfiableError());

    const res = makeRes('bytes=99999-');
    await serve(res);

    expect(res.statusCode).toBe(416);
    expect(res.sentHeaders['accept-ranges']).toBe('bytes');
    expect(res.jsonBody).toEqual({
      success: false,
      error: { message: 'Range not satisfiable' },
    });
    // Falling through to Meta here would serve a 200 + whole body and make the
    // player restart from zero.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to Meta when R2 fails before any byte is written', async () => {
    getObjectStreamMock.mockRejectedValue(new Error('R2 down'));
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://lookaside.example/media', mime_type: 'video/mp4' }),
      })
      .mockResolvedValueOnce(
        metaMediaResponse(200, 'meta-bytes', { 'accept-ranges': 'bytes', 'content-length': '10' })
      );

    const res = makeRes();
    await serve(res);

    expect(res.statusCode).toBe(200);
    expect(res.sentHeaders['accept-ranges']).toBe('bytes');
    expect(Buffer.concat(res.written).toString()).toBe('meta-bytes');
  });

  it('does not retry through Meta once bytes are already on the wire', async () => {
    async function* halfThenDie() {
      yield Buffer.from('half');
      throw new Error('R2 socket died');
    }
    getObjectStreamMock.mockResolvedValue({
      body: Readable.from(halfThenDie()),
      contentLength: 8,
      contentType: 'video/mp4',
      status: 200,
    });

    const res = makeRes();
    await serve(res);

    // Starting a second body here would append it to the response the client is
    // mid-read on, so the truncated stream is simply closed.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Buffer.concat(res.written).toString()).toBe('half');
    // pipeline() tears the response down, so the client sees a broken connection
    // rather than a short body it would mistake for the whole file.
    expect(res.destroyed).toBe(true);
  });
});

describe('streamMedia — Meta fallback', () => {
  beforeEach(() => {
    // Nothing archived — the second lookup finds no row with a mediaUrl.
    prismaMock.waMessage.findFirst.mockReset();
    prismaMock.waMessage.findFirst
      .mockResolvedValueOnce({ id: 'msg_1' })
      .mockResolvedValueOnce(null);
  });

  it('forwards the Range header upstream and mirrors the 206', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://lookaside.example/media', mime_type: 'video/mp4' }),
      })
      .mockResolvedValueOnce(
        metaMediaResponse(206, 'ta-by', {
          'content-range': 'bytes 2-6/10',
          'content-length': '5',
          'accept-ranges': 'bytes',
        })
      );

    const res = makeRes('bytes=2-6');
    await serve(res);

    expect(fetchMock.mock.calls[1][1].headers).toEqual({
      Authorization: 'Bearer test_token',
      Range: 'bytes=2-6',
    });
    expect(res.statusCode).toBe(206);
    expect(res.sentHeaders['content-range']).toBe('bytes 2-6/10');
    expect(res.sentHeaders['content-length']).toBe('5');
    expect(Buffer.concat(res.written).toString()).toBe('ta-by');
  });

  it('stays at 200 when the CDN ignores the range', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://lookaside.example/media', mime_type: 'video/mp4' }),
      })
      .mockResolvedValueOnce(metaMediaResponse(200, 'whole-file'));

    const res = makeRes('bytes=2-6');
    await serve(res);

    // Claiming 206 while sending the full body makes the player decode garbage.
    expect(res.statusCode).toBe(200);
    expect(res.sentHeaders['content-range']).toBeUndefined();
    expect(res.sentHeaders['accept-ranges']).toBeUndefined();
    expect(Buffer.concat(res.written).toString()).toBe('whole-file');
  });

  it('passes a 416 from the CDN straight through', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://lookaside.example/media', mime_type: 'video/mp4' }),
      })
      .mockResolvedValueOnce(metaMediaResponse(416, ''));

    const res = makeRes('bytes=99999-');
    await serve(res);

    expect(res.statusCode).toBe(416);
    expect(res.jsonBody).toEqual({
      success: false,
      error: { message: 'Range not satisfiable' },
    });
  });
});

describe('streamMedia — ownership guard', () => {
  it('rejects a media id that belongs to no stored message', async () => {
    prismaMock.waMessage.findFirst.mockReset();
    prismaMock.waMessage.findFirst.mockResolvedValue(null);

    const res = makeRes();
    await expect(serve(res, 'GUESSED_ID')).rejects.toMatchObject({
      statusCode: 404,
      code: 'WA_MEDIA_NOT_FOUND',
    });
    expect(getObjectStreamMock).not.toHaveBeenCalled();
  });
});
