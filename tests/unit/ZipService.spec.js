/**
 * @jest-environment jsdom
 */
import JSZip from 'jszip'
import ZipService from '../../src/services/ZipService'

const mockUpload = jest.fn()

jest.mock('services/Services', () => ({
  getImageService: () => ({
    upload: (url, formData) => mockUpload(url, formData)
  })
}))

/**
 * Builds an archive in memory. The result is handed to uploadImages exactly as
 * the browser would hand it over, so the archive building is not what is under
 * test here.
 */
async function archive (entries) {
  let zip = new JSZip()
  for (let name in entries) {
    zip.file(name, entries[name])
  }
  return zip.generateAsync({type: 'uint8array'})
}

/**
 * The shape a file input actually produces.
 */
async function archiveAsFile (entries, name) {
  let zip = new JSZip()
  for (let entry in entries) {
    zip.file(entry, entries[entry])
  }
  let blob = await zip.generateAsync({type: 'blob'})
  return new File([blob], name, {type: 'application/zip'})
}

function modelWithBackgroundImages (urls) {
  let model = {screens: {}, widgets: {}}
  urls.forEach((url, i) => {
    model.screens['s' + i] = {id: 's' + i, x: 0, y: 0, style: {backgroundImage: {url: url}}}
  })
  return model
}

describe('ZipService.uploadImages', () => {

  let consoleError

  beforeEach(() => {
    mockUpload.mockReset()
    mockUpload.mockResolvedValue(JSON.stringify({uploads: [{url: 'uploaded.png'}]}))
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  test('rejects when no file was selected', async () => {
    await expect(ZipService.uploadImages(null, 'm1')).rejects.toThrow('No file selected')
  })

  test('reads a real File, the way a file input hands it over', async () => {
    let file = await archiveAsFile({
      'design.json': JSON.stringify(modelWithBackgroundImages(['image0.png'])),
      'image0.png': 'first'
    }, 'my-design.zip')

    let result = await ZipService.uploadImages(file, 'm1')

    expect(result.missingImages).toEqual([])
    expect(Object.values(result.model.screens)[0].style.backgroundImage.url).toBe('uploaded.png')
  })

  test('rejects when the file is not a zip archive', async () => {
    await expect(ZipService.uploadImages('this is not a zip', 'm1')).rejects.toThrow(/not a valid zip archive/)
  })

  test('rejects when design.json is missing and says what it did find', async () => {
    let file = await archive({'mydesign/design.json': '{}'})

    await expect(ZipService.uploadImages(file, 'm1')).rejects.toThrow(/mydesign\/design\.json/)
  })

  test('rejects when design.json is not valid JSON', async () => {
    let file = await archive({'design.json': 'not json at all'})

    await expect(ZipService.uploadImages(file, 'm1')).rejects.toThrow(/not valid JSON/)
  })

  test('uploads the images it finds and rewrites their urls', async () => {
    let file = await archive({
      'design.json': JSON.stringify(modelWithBackgroundImages(['image0.png', 'image1.png'])),
      'image0.png': 'first',
      'image1.png': 'second'
    })

    let result = await ZipService.uploadImages(file, 'm1')

    expect(result.missingImages).toEqual([])
    expect(mockUpload).toHaveBeenCalledTimes(2)
    expect(Object.values(result.model.screens).map(s => s.style.backgroundImage.url))
      .toEqual(['uploaded.png', 'uploaded.png'])
  })

  test('reports progress while uploading', async () => {
    let file = await archive({
      'design.json': JSON.stringify(modelWithBackgroundImages(['image0.png', 'image1.png'])),
      'image0.png': 'first',
      'image1.png': 'second'
    })
    let progress = []

    await ZipService.uploadImages(file, 'm1', (done, total) => progress.push([done, total]))

    expect(progress).toEqual([[1, 2], [2, 2]])
  })

  /**
   * A design.json pointing at an image the archive does not hold used to abort
   * the whole import with a bare TypeError from JSZip.
   */
  test('warns and continues when design.json references an absent image', async () => {
    let file = await archive({
      'design.json': JSON.stringify(modelWithBackgroundImages(['image0.png', 'gone.png'])),
      'image0.png': 'first'
    })

    let result = await ZipService.uploadImages(file, 'm1')

    expect(result.missingImages).toEqual(['gone.png'])
    expect(mockUpload).toHaveBeenCalledTimes(1)

    let screens = Object.values(result.model.screens)
    expect(screens[0].style.backgroundImage.url).toBe('uploaded.png')
    expect(screens[1].style.backgroundImage).toBeUndefined()
  })

  test('reports an absent image only once, however often it is referenced', async () => {
    let model = modelWithBackgroundImages(['gone.png', 'gone.png', 'gone.png'])
    let file = await archive({'design.json': JSON.stringify(model)})

    let result = await ZipService.uploadImages(file, 'm1')

    expect(result.missingImages).toEqual(['gone.png'])
  })

  test('propagates an upload failure', async () => {
    mockUpload.mockRejectedValue(new Error('Could not upload to /rest/images/m1 (HTTP 401)'))
    let file = await archive({
      'design.json': JSON.stringify(modelWithBackgroundImages(['image0.png'])),
      'image0.png': 'first'
    })

    await expect(ZipService.uploadImages(file, 'm1')).rejects.toThrow('HTTP 401')
  })

  test('fails clearly when the server answers with something that is not JSON', async () => {
    mockUpload.mockResolvedValue('<html>gateway timeout</html>')
    let file = await archive({
      'design.json': JSON.stringify(modelWithBackgroundImages(['image0.png'])),
      'image0.png': 'first'
    })

    await expect(ZipService.uploadImages(file, 'm1')).rejects.toThrow(/did not return valid JSON/)
  })

  test('fails clearly when the server returns no image', async () => {
    mockUpload.mockResolvedValue(JSON.stringify({uploads: []}))
    let file = await archive({
      'design.json': JSON.stringify(modelWithBackgroundImages(['image0.png'])),
      'image0.png': 'first'
    })

    await expect(ZipService.uploadImages(file, 'm1')).rejects.toThrow(/did not return an image/)
  })
})

describe('ZipService.writeZipToBlob', () => {

  let originalFetch
  let consoleError

  beforeEach(() => {
    originalFetch = global.fetch
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    consoleError.mockRestore()
  })

  function mockFetch (failing) {
    global.fetch = jest.fn(url => {
      if (failing.some(name => url.indexOf(name) > -1)) {
        return Promise.resolve({status: 404, text: () => Promise.resolve('no such image')})
      }
      return Promise.resolve({status: 200, blob: () => Promise.resolve(new Blob(['binary']))})
    })
  }

  test('renames the images it embeds and keeps design.json consistent', async () => {
    mockFetch([])
    let model = modelWithBackgroundImages(['/rest/images/one.png', '/rest/images/two.jpg'])

    let {content, missingImages} = await ZipService.writeZipToBlob(model, 'jwt')

    expect(missingImages).toEqual([])

    let zip = await new JSZip().loadAsync(content)
    expect(Object.keys(zip.files).sort()).toEqual(['design.json', 'image0.png', 'image1.jpg'])

    let design = JSON.parse(await zip.file('design.json').async('string'))
    expect(Object.values(design.screens).map(s => s.style.backgroundImage.url))
      .toEqual(['image0.png', 'image1.jpg'])
  })

  /**
   * Leaving the original url in design.json produced an archive that referred to
   * a file it did not contain, so importing it back always failed.
   */
  test('drops an image it could not fetch so the archive stays importable', async () => {
    mockFetch(['two.jpg'])
    let model = modelWithBackgroundImages(['/rest/images/one.png', '/rest/images/two.jpg'])

    let {content, missingImages} = await ZipService.writeZipToBlob(model, 'jwt')

    expect(missingImages).toEqual(['/rest/images/two.jpg'])

    let zip = await new JSZip().loadAsync(content)
    let design = JSON.parse(await zip.file('design.json').async('string'))
    let screens = Object.values(design.screens)

    expect(screens[0].style.backgroundImage.url).toBe('image0.png')
    expect(screens[1].style.backgroundImage).toBeUndefined()

    /**
     * Every url design.json still carries has to exist in the archive.
     */
    let referenced = []
    ZipService.getImages(design).forEach(({image}) => referenced.push(image.url))
    referenced.forEach(url => {
      expect(zip.file(url)).not.toBeNull()
    })
  })

  test('does not modify the model it was given', async () => {
    mockFetch(['two.jpg'])
    let model = modelWithBackgroundImages(['/rest/images/one.png', '/rest/images/two.jpg'])

    await ZipService.writeZipToBlob(model, 'jwt')

    expect(Object.values(model.screens)[1].style.backgroundImage.url).toBe('/rest/images/two.jpg')
  })
})

describe('ZipService.getFileType', () => {

  test('reads the extension of a plain file name', () => {
    expect(ZipService.getFileType('image0.png')).toBe('png')
  })

  test('ignores a query string', () => {
    expect(ZipService.getFileType('a.png?token=abc')).toBe('png')
  })

  test('ignores directories in the path', () => {
    expect(ZipService.getFileType('/rest/images/abc.png')).toBe('png')
  })

  test('falls back to png for a name without an extension', () => {
    expect(ZipService.getFileType('5f2b1c')).toBe('png')
  })
})
