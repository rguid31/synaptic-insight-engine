import { transformStructuredData } from './analyze.js';

describe('transformStructuredData', () => {
    it('should convert a valid data array to a key-value object', () => {
        const inputArray = [
            { section: 'title', content: 'Test Title' },
            { section: 'author', content: 'Test Author' }
        ];
        const expectedObject = {
            title: 'Test Title',
            author: 'Test Author'
        };
        expect(transformStructuredData(inputArray)).toEqual(expectedObject);
    });

    it('should return an empty object for null input', () => {
        expect(transformStructuredData(null)).toEqual({});
    });

    it('should return an empty object for non-array input', () => {
        expect(transformStructuredData('not an array')).toEqual({});
    });

    it('should return an empty object for an empty array', () => {
        expect(transformStructuredData([])).toEqual({});
    });

    it('should handle array with items missing section or content', () => {
        const inputArray = [
            { section: 'title', content: 'Test Title' },
            { content: 'No section here' },
            { section: 'author' }
        ];
        const expectedObject = {
            title: 'Test Title',
            author: undefined
        };
        expect(transformStructuredData(inputArray)).toEqual(expectedObject);
    });
});