import Logger from 'common/Logger'
import Services from 'services/Services'

/**
 * The one entry every export writes and every import looks for. It has to sit
 * at the top level of the archive, JSZip's file() does not search sub folders.
 */
const DESIGN_FILE = 'design.json'

class ZipService {

  constructor () {
    this.logger = new Logger('ZipService')
  }

  /**
   * Writes a design plus all its background images into a zip.
   * Resolves to {content, missingImages}. Images that could not be fetched are
   * dropped from the model, so that the resulting archive is always consistent
   * with the design.json inside it.
   */
  async writeZipToBlob (model, jwtToken) {
    this.logger.log(-1, 'writeZipToBlob', 'enter')

    model = JSON.parse(JSON.stringify(model))

    let JSZip = await import(/* webpackChunkName: "jszip" */ 'jszip')

    let baseZip = new JSZip.default();

    /*
    * create images and rename them
    */
    let missingImages = []
    let images = this.getImages(model)
    for (let i=0; i < images.length; i++) {
      let {element, image} = images[i]
      let imageUrl = image.url
      let url = `/rest/images/${imageUrl}?token=${jwtToken}`
      try {
        let imgData = await this.getBlob(url)
        let filename = 'image' + i + '.' + this.getFileType(imageUrl)
        baseZip.file(filename, imgData)
        this.logger.log(-1, 'writeZipToBlob', 'image', filename)
        /**
         * Do not forget to update the url
         */
        image.url = filename
      } catch (err) {
        /**
         * Leaving the original url behind would produce an archive that
         * references a file it does not contain, which then fails on import.
         * Drop the reference instead and report it.
         */
        this.logger.error('writeZipToBlob', 'Could not load image > ' + url)
        this.dropBackgroundImage(element)
        missingImages.push(imageUrl)
      }
    }

    /**
     * add updated model
     */
    baseZip.file(DESIGN_FILE, JSON.stringify(model, null, 2));

    /**
     * Generate zip file as blob and return
     */
    let content = await baseZip.generateAsync({type: "blob"})

    this.logger.log(-1, 'writeZipToBlob', 'exit')

    return {content: content, missingImages: missingImages}
  }

  getFileType (url) {
    let name = String(url).split('?')[0].split('#')[0]
    let segments = name.split('/')
    name = segments[segments.length - 1]
    let parts = name.split('.')
    let type = parts.length > 1 ? parts.pop() : ''
    return type || 'png'
  }

  getBlob(url) {
    return new Promise((resolve, reject) => {
        fetch(url, {
            method: 'get',
            credentials: "same-origin"
        }).then((res) => {
            if (res.status === 200) {
                res.blob().then(j => {
                    resolve(j)
                })
            } else {
                res.text().then(txt => {
                    reject(new Error(txt))
                })
            }
        }).catch((err) => {
            reject(err)
        })
    })
  }

  /**
   * Every background image of the model, paired with the screen or widget that
   * owns it, so that a failing image can be detached from the model.
   */
  getImages (model) {
    let result = []
    for (let id in model.screens) {
      let screen = model.screens[id]
      if (screen.style && screen.style.backgroundImage) {
        result.push({element: screen, image: screen.style.backgroundImage})
      }
    }
    for (let id in model.widgets) {
      let widget = model.widgets[id]
      if (widget.style && widget.style.backgroundImage) {
        result.push({element: widget, image: widget.style.backgroundImage})
      }
    }
    return result
  }

  dropBackgroundImage (element) {
    if (element && element.style) {
      delete element.style.backgroundImage
    }
  }

  /**
   * Reads a design zip, uploads its images and rewrites the image urls in the
   * model to the ones the server handed out.
   * Resolves to {model, missingImages}. Images referenced by design.json but
   * absent from the archive are reported and dropped, the rest is imported.
   */
  async uploadImages (file, modelId, progressListener) {
    this.logger.log(-1, 'uploadImages', 'enter', modelId)

    if (!file) {
      throw new Error('No file selected')
    }

    let JSZip = await import(/* webpackChunkName: "jszip" */ 'jszip')
    let url = '/rest/images/' + modelId;

    let zip = new JSZip.default();
    try {
      await zip.loadAsync(file)
    } catch (err) {
      throw new Error('"' + (file.name || 'The file') + '" is not a valid zip archive: ' + err.message)
    }

    let designEntry = zip.file(DESIGN_FILE)
    if (!designEntry) {
      let found = Object.keys(zip.files)
      let hint = found.length > 0
        ? ' The archive contains: ' + found.slice(0, 10).join(', ')
        : ' The archive is empty.'
      throw new Error('Could not find ' + DESIGN_FILE + ' in the archive, it has to be at the top level.' + hint)
    }

    let design
    try {
      design = await designEntry.async("string");
    } catch (err) {
      throw new Error('Could not read ' + DESIGN_FILE + ': ' + err.message)
    }

    let model
    try {
      model = JSON.parse(design)
    } catch (err) {
      throw new Error(DESIGN_FILE + ' is not valid JSON: ' + err.message)
    }
    if (!model || typeof model !== 'object') {
      throw new Error(DESIGN_FILE + ' does not contain a design')
    }

    let images = this.getImages(model)
    let total = images.length
    let done = 0
    let missingImages = []
    for (let i=0; i < total; i++) {
      let {element, image} = images[i]
      let imageEntry = image.url ? zip.file(image.url) : null
      if (!imageEntry) {
        this.logger.error('uploadImages', 'Image missing from archive', image.url)
        this.dropBackgroundImage(element)
        if (missingImages.indexOf(image.url) < 0) {
          missingImages.push(image.url || '(unnamed image)')
        }
        continue
      }
      let imageBuffer = await imageEntry.async("Blob");
      let upload = await this.uploadImage(image, imageBuffer, url)
      image.url = upload.url
      done++
      if (progressListener) {
        progressListener(done, total)
      }
    }

    return {model: model, missingImages: missingImages}
  }

  async uploadImage (image, imageBuffer, url) {
    let imageService = Services.getImageService()
    let fileType = this.getFileType(image.url)
    let blob = new Blob([imageBuffer], {type: "image/" +fileType})
    let formData = new FormData()
    let name = image.url
    this.logger.log(-1, 'uploadImage', 'enter', name + ' as ' + fileType)
    formData.append(name, blob, name)

    let uploadResponse = await imageService.upload(url, formData)

    let parsed
    try {
      parsed = JSON.parse(uploadResponse)
    } catch (err) {
      throw new Error('Server did not return valid JSON while uploading "' + name + '"')
    }

    let upload = parsed && parsed.uploads ? parsed.uploads[0] : null
    if (!upload || !upload.url) {
      this.logger.error('uploadImage', 'Could not upload image', name)
      throw new Error('Server did not return an image for "' + name + '"')
    }
    return upload
  }

}

export default new ZipService()
