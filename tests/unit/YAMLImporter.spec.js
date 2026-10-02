import YAMLImporter from '../../src/core/ai/YAMLImporter'

/**
 * These four padding assignments ended in commas instead of semicolons, so
 * the block parsed as a single comma expression and only the last one ran:
 * paddingBottom, paddingTop and paddingLeft were silently never assigned.
 * getCorrectedHeight() in CSSPosition subtracts paddingBottom, so exported
 * heights were too tall as well.
 */
test('YAMLImporter.getStyle() > a TABLE keeps all four paddings', () => {
    const style = new YAMLImporter().getStyle('TABLE', { TYPE: 'Table' })
    expect(style.paddingBottom).toBe('@form-padding-vertical')
    expect(style.paddingTop).toBe('@form-padding-vertical')
    expect(style.paddingLeft).toBe('@form-padding-horizontal')
    expect(style.paddingRight).toBe('@form-padding-horizontal')
})

test('YAMLImporter.getStyle() > an INPUT keeps all four paddings', () => {
    const style = new YAMLImporter().getStyle('INPUT', { TYPE: 'TextBox' })
    expect(style.paddingBottom).toBe('@form-padding-vertical')
    expect(style.paddingTop).toBe('@form-padding-vertical')
    expect(style.paddingLeft).toBe('@form-padding-horizontal')
    expect(style.paddingRight).toBe('@form-padding-horizontal')
})

test('YAMLImporter.getStyle() > a Checkbox INPUT keeps all four paddings', () => {
    const style = new YAMLImporter().getStyle('INPUT', { TYPE: 'Checkbox' })
    expect(style.paddingBottom).toBe('@form-padding-vertical')
    expect(style.paddingTop).toBe('@form-padding-vertical')
    expect(style.paddingLeft).toBe('@form-padding-horizontal')
    expect(style.paddingRight).toBe('@form-padding-horizontal')
})

test('YAMLImporter.getStyle() > does not lose the other style properties', () => {
    const style = new YAMLImporter().getStyle('TABLE', { TYPE: 'Table' })
    expect(style.background).toBe('@form-background')
    expect(style.borderColor).toBe('@form-border-color')
    expect(style.borderStyle).toBe('solid')
    expect(style.headerFontWeight).toBe(800)
})