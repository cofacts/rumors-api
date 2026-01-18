import genAITranscript from '../genAITranscript';
import client from 'util/client';
import mediaManager from 'util/mediaManager';
import { createTranscript, getAIResponse } from 'graphql/util';
import { writeAITranscript } from 'graphql/mutations/CreateMediaArticle';

jest.mock('util/client');
jest.mock('util/mediaManager');
jest.mock('graphql/util');
jest.mock('graphql/mutations/CreateMediaArticle');

describe('genAITranscript', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('skips empty articleIds', async () => {
        const result = await genAITranscript({ articleIds: [] });
        expect(result.count).toBe(0);
    });

    it('handles various article states', async () => {
        const articleIds = [
            'not-found',
            'no-media',
            'has-text',
            'has-ai',
            'needs-transcript',
        ];

        client.mget.mockResolvedValue({
            body: {
                docs: [
                    { _id: 'not-found', found: false },
                    { _id: 'no-media', found: true, _source: { text: '' } }, // No attachmentHash
                    {
                        _id: 'has-text',
                        found: true,
                        _source: {
                            attachmentHash: 'h1',
                            text: 'some text',
                            articleType: 'IMAGE',
                        },
                    },
                    {
                        _id: 'has-ai',
                        found: true,
                        _source: {
                            attachmentHash: 'h2',
                            text: '',
                            articleType: 'VIDEO',
                        },
                    },
                    {
                        _id: 'needs-transcript',
                        found: true,
                        _source: {
                            attachmentHash: 'h3',
                            text: '',
                            articleType: 'AUDIO',
                        },
                    },
                ],
            },
        });

        // Mock getAIResponse for 'has-ai' case
        getAIResponse.mockImplementation(({ docId }) => {
            if (docId === 'h2') return Promise.resolve({ status: 'SUCCESS' });
            return Promise.resolve(null);
        });

        // Mock mediaManager and createTranscript for 'needs-transcript'
        mediaManager.get.mockResolvedValue({ id: 'h3', url: 'http://foo' });
        createTranscript.mockResolvedValue({
            status: 'SUCCESS',
            text: 'Transcribed text',
        });

        const result = await genAITranscript({ articleIds });

        expect(result.count).toBe(1);
        expect(result.results).toEqual([
            { id: 'not-found', status: 'SKIPPED', reason: 'Article not found' },
            { id: 'no-media', status: 'SKIPPED', reason: 'Not a media article' },
            { id: 'has-text', status: 'SKIPPED', reason: 'Article already has text' },
            {
                id: 'has-ai',
                status: 'SKIPPED',
                reason: 'Existing AI transcript found',
            },
            { id: 'needs-transcript', status: 'SUCCESS' },
        ]);

        expect(writeAITranscript).toHaveBeenCalledWith(
            'needs-transcript',
            'Transcribed text'
        );
    });

    it('forces regeneration', async () => {
        const articleIds = ['has-text'];
        client.mget.mockResolvedValue({
            body: {
                docs: [
                    {
                        _id: 'has-text',
                        found: true,
                        _source: {
                            attachmentHash: 'h1',
                            text: 'old text',
                            articleType: 'IMAGE',
                        },
                    },
                ],
            },
        });

        mediaManager.get.mockResolvedValue({ id: 'h1' });
        createTranscript.mockResolvedValue({ status: 'SUCCESS', text: 'New text' });

        const result = await genAITranscript({ articleIds, force: true });

        expect(result.count).toBe(1);
        expect(result.results[0].status).toBe('SUCCESS');
        expect(writeAITranscript).toHaveBeenCalledWith('has-text', 'New text');
    });

    it('handles failures', async () => {
        const articleIds = ['fail'];
        client.mget.mockResolvedValue({
            body: {
                docs: [
                    {
                        _id: 'fail',
                        found: true,
                        _source: {
                            attachmentHash: 'h',
                            text: '',
                            articleType: 'IMAGE',
                        },
                    },
                ],
            },
        });
        mediaManager.get.mockResolvedValue({ id: 'h' });
        createTranscript.mockResolvedValue({ status: 'ERROR', text: 'API Error' });

        const result = await genAITranscript({ articleIds });
        expect(result.count).toBe(0);
        expect(result.results[0].status).toBe('FAILED');
    });
});
