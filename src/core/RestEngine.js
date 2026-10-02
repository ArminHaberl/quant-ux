import Logger from './Logger'

class RestEngine {

    constructor () {
    }

    run (request, data) {

        if (request.method === "GET") {
            return this.get(request, data)
        }
        
        if (request.method === "POST" && request.input.type === 'FORM') {
            return this.postOrPutForm(request, data)
        }
        if (request.method === "POST" && request.input.type === 'JSON') {
            return this.postOrPut(request, data)
        }
        if (request.method === "POST" && (request.input.type === 'IMAGE' || request.input.type === 'FILE')) {
            return this.postOrPostImage(request, data)
        }
     
        if (request.method === "PUT" && request.input.type === 'JSON') {
            return this.postOrPut(request, data)
        }
        if (request.method === "PUT" && request.input.type === 'FORM') {
            return this.postOrPutForm(request, data)
        }
        if (request.method === "PUT" && (request.input.type === 'IMAGE' || request.input.type === 'FILE')) {
            return this.postOrPostImage(request, data)
        }

        if (request.method === "DELETE") {
            return this.delete(request, data)
        }
    }

    async buildURL (request, values) {
        let url = await this.fillString(request.url, values, false);
        Logger.log(11, "RestEngine.buildURL()", "exit" ,url)
        return url;
    }

    async buildFormData (request, values) {
        const formData = new FormData()      
        const lines = request.input.template.split('\n')
        for (let line of lines) {
            const parts = line.split(':')
            if (parts.length === 2) {
                const key = parts[0]
                const value = parts[1]
                const data = await this.fillString(value, values, true);
                formData.append(key, data)
            } else {
                throw new Error("buildFormData() > template not ok") 
            }
        }
        Logger.log(-1, "RestEngine.buildFormData() > exit", formData)
        return formData;
    }

    async buildData (request, values) {
        let data = await this.fillString(request.input.template, values, true);
        Logger.log(1, "RestEngine.buildData() > exit", data)
        return data;
    }

    async buildToken (request, values) {
        let data = await this.fillString(request.token, values, true);
        Logger.log(1, "RestEngine.buildToken() > exit", data)
        return data;
    }
    
    async fillString (s, values, encodeFiles = true) {
        /**
         * An unset optional field (request.token is null for a REST widget
         * with no auth) used to reach fillSimpleString and throw
         * "cannot read replace of null" out of the middle of the request.
         */
        if (s === undefined || s === null) {
            return s
        }
        const finalValues = {}
        for (let key in values) {
            let value = this.getValueByKey(values, key)
            value = await this.getStringFilelValue(value, encodeFiles)
            finalValues[key] = value
        }
        /**
         * finalValues, not values: the loop above exists to base64 encode
         * uploaded files, and substituting the raw values put a "[object
         * File]" into the request body.
         */
        s = this.fillSimpleString(s, finalValues)
        if (s.indexOf('${') >= 0){
            Logger.error("RestEngine.fillString() > error" ,s)
            throw new Error("fillString() > Not all parameters replaced!" + s)
        }
        return s
    }

    fillSimpleString (template, values) {
        return template.replace(/\${(.*?)}/g, (match, key) => {
            /**
             * Not `values[key] || match`: 0, '' and false are legitimate
             * values, and treating them as missing left the ${...} in place
             * so fillString() then threw "Not all parameters replaced".
             */
            const value = values[key.trim()]
            return value === undefined || value === null ? match : value
        });
    }


    getDataBindingVariables (s) {
        let matches = []
        this.parseString(s, matches)
        return matches
    }

    getValueByKey (values, key) {
        /**
         * Shouldn't thjsi be JSONPath?
         */
        return values[key]
    }

    replacePattern (s, pattern, value) {
        let i = 0
        while (s.indexOf(pattern) >= 0 && i < 100) {
            s = s.replace(pattern, value)
            i++
        }
        return s
    }


    getStringFilelValue (value, encodeFiles) {
        // FIXME: check if we contain ${} to avoid messz stuff
        if (value && value.name && value.size && encodeFiles) {
            value = this.readFileAsBase64(value)
        }
        return value
    }

    async readFileAsBase64 (file) {
        let result = await this.base64(file)
        return result
    }

    dataUrl (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = error => reject(error);
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    base64 (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = error => reject(error);
            reader.onload = () => {
                let bytes = Array.from(new Uint8Array(reader.result));
                let base64StringFile = btoa(bytes.map((item) => String.fromCharCode(item)).join(""));
                resolve(base64StringFile);
            }
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Turns a fetch response into the value the REST widget binds to, and
     * throws for anything it cannot represent.
     *
     * This used to take a `resolve` callback. An unrecognised output type
     * therefore returned without calling resolve and the caller waited
     * forever, so an unsupported type is now an explicit error.
     */
    async handleOutput (request, response) {
        Logger.log(2, "RestEngine.handleOutput() > enter" ,response)

        if (response.status == 200 || response.status == 201 || response.status == 204) {
            if (request.output.type === "JSON") {
                try {
                    return await response.json()
                } catch (e){
                    throw new Error(`Could not ${request.method} ${request.url}: ${e.message}`)
                }
            }
            if (request.output.type === "TEXT") {
                return await response.text()
            }
            if (request.output.type === "IMAGE") {
                return await response.arrayBuffer()
            }
            throw new Error(`Could not ${request.method} ${request.url}: unsupported output type '${request.output && request.output.type}'`)
        }
        throw new Error(`Could not ${request.method} ${request.url}: ${response.statusText}`)
    }

    async get (request, values) {
        const url = await this.buildURL(request, values)
        const header = await this.createDefaultHeader(request, values)

        const response = await fetch(url, {
            method: "GET",
            mode: 'cors',
            cache: 'no-cache',
            headers: header,
            redirect: 'follow',
            referrer: 'no-referrer'
        })
        return this.handleOutput(request, response)
    }

    async postOrPostImage (request, values) {
        const url = await this.buildURL(request, values)
        const header = await this.createDefaultHeader(request, values)
        const formData = new FormData()
        for (let key in values) {
            formData.append(key, values[key])
        }

        const response = await fetch(url, {
            method: request.method,
            mode: 'cors',
            cache: 'no-cache',
            headers: header,
            redirect: 'follow',
            referrer: 'no-referrer',
            body: formData
        })
        return this.handleOutput(request, response)
    }

    async postOrPutForm (request, values) {
        Logger.log(1, "RestEngine.postOrPutForm() > enter >")
        const url = await this.buildURL(request, values)
        const formData = await this.buildFormData(request, values)
        const header = await this.createDefaultHeader(request, values)

        const response = await fetch(url, {
            method: request.method,
            mode: 'cors',
            cache: 'no-cache',
            headers: header,
            redirect: 'follow',
            referrer: 'no-referrer',
            body: formData
        })
        return this.handleOutput(request, response)
    }

    async postOrPut (request, values) {
        const url = await this.buildURL(request, values)
        const data = await this.buildData(request, values)
        const header = await this.createDefaultHeader(request, values)

        const response = await fetch(url, {
            method: request.method,
            mode: 'cors',
            cache: 'no-cache',
            headers: header,
            redirect: 'follow',
            referrer: 'no-referrer',
            body: data
        })
        return this.handleOutput(request, response)
    }

    async delete (request, values) {
        const url = await this.buildURL(request, values)
        const header = await this.createDefaultHeader(request, values)

        const response = await fetch(url, {
            method: "DELETE",
            mode: 'cors',
            cache: 'no-cache',
            headers: header,
            redirect: 'follow',
            referrer: 'no-referrer'
        })
        return this.handleOutput(request, response)
    }

    async createDefaultHeader(request, values) {
        let token = await this.buildToken(request, values)
        let authType= request.authType ? request.authType : 'Bearer'
        let headers = {}

        const inputType = request.input ? request.input.type : null
        if (inputType === 'JSON') {
            headers['Content-Type'] = 'application/json'
            headers['Accept'] = 'application/json'
        }

        if (token) {
            headers['Authorization'] = `${authType} ${token}`
        }

        if (request.headers) {
            request.headers.forEach(header => {
                let key = this.fillSimpleString(header.key, values)
                let value = this.fillSimpleString(header.value, values)
                headers[key] = value
            })
        }

        return headers
    }

    getNeededDataBings (rest) {
        let result = []
        this.parseString(rest.url, result)
        this.parseString(rest.token, result)
        if ((rest.method === 'POST' || rest.method === 'PUT') && (rest.input.type === 'JSON' || rest.input.type === 'FORM')) {
            this.parseString(rest.input.template, result)
        }
        if ((rest.method === 'POST' || rest.method === 'PUT') && (rest.input.type === 'FILE' || rest.input.type === 'IMAGE')) {
            if (rest.input.fileDataBinding) {
                result.push(rest.input.fileDataBinding)
            }
        }
        if (rest.headers) {
            rest.headers.forEach(header => {
                this.parseString(header.key, result) 
                this.parseString(header.value, result) 
            })
        }
        return result;
    }

    parseString (s, result) {
        let matches = s.match(/\$\{(.*?)\}/g)
        if (matches) {
            matches.forEach(m => {
                let variable = m.substring(2, m.length -1)
                if (result.indexOf(variable) < 0) {
                    result.push(variable)
                }
            })
        }
    }
}
export default new RestEngine()