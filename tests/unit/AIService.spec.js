import AIService from '../../src/services/AIService'

/**
 * extractHTML searched for the literal 'html>', which always matches two
 * characters inside the closing '</html>' as well. For the most common model
 * reply, which opens with <html lang="en">, the two indexes crossed and
 * String.substring silently swapped them, so the function returned just
 * "</html>" and the caller wrapped it into "<html></html></html>". The
 * dialog took the success branch and showed an empty preview.
 */
test('AIService.extractHTML() > extracts a reply that opens with an html lang attribute', () => {
    const reply = '```html\n<html lang="en">\n<body><h1>Hello</h1></body>\n</html>\n```'
    const result = new AIService().extractHTML(reply)
    expect(result.html).toBeDefined()
    expect(result.html).toBe('<html>\n<body><h1>Hello</h1></body>\n</html>')
    expect(result.html).not.toContain('<html lang')
})

test('AIService.extractHTML() > extracts a plain html reply', () => {
    const reply = '```html\n<html>\n<body><h1>Hi</h1></body>\n</html>```'
    const result = new AIService().extractHTML(reply)
    expect(result.html).toBe('<html>\n<body><h1>Hi</h1></body>\n</html>')
})

test('AIService.extractHTML() > extracts a reply preceded by a doctype', () => {
    const reply = '```html\n<!DOCTYPE html>\n<html lang="en">\n<body>x</body>\n</html>```'
    const result = new AIService().extractHTML(reply)
    expect(result.html).toBe('<html>\n<body>x</body>\n</html>')
})

test('AIService.extractHTML() > returns an error when there is no html', () => {
    const result = new AIService().extractHTML('```\njust some prose\n```')
    expect(result.html).toBeUndefined()
    expect(result.error).toBe('design-gpt.error-no-html')
})

test('AIService.extractHTML() > returns an error for empty content', () => {
    const result = new AIService().extractHTML('')
    expect(result.html).toBeUndefined()
    expect(result.error).toBe('error-no-content')
})