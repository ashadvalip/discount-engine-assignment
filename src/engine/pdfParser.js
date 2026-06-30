/**
 * pdfParser.js
 *
 * Handles PDF text extraction and tabular row alignment.
 * Focuses purely on parsing layout lines and grouping columns by coordinates.
 * Output is raw, uncleaned, unvalidated row data.
 */

export function loadPdfJS() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js'
      resolve(window.pdfjsLib)
    }
    script.onerror = (err) => reject(new Error('Failed to load PDF.js script from CDN.'))
    document.head.appendChild(script)
  })
}

/**
 * Extracts raw, unvalidated row structures from the PDF ArrayBuffer.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ rows: Array<Object>, errors: Array<string> }>}
 */
export async function parseCartPDF(arrayBuffer) {
  const pdfjsLib = await loadPdfJS()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  
  // Extract text content from page 1
  const page = await pdf.getPage(1)
  const textContent = await page.getTextContent()
  
  const rawItems = textContent.items.map(item => ({
    text: item.str.trim(),
    x: item.transform[4],
    y: item.transform[5],
    width: item.width,
    height: item.height
  })).filter(item => item.text !== '')

  if (rawItems.length === 0) {
    return { rows: [], errors: ["No readable text content found in PDF."] }
  }

  // 1. Group items into lines by y-coordinate (with a 5px tolerance)
  const lines = []
  rawItems.forEach(item => {
    let line = lines.find(l => Math.abs(l.y - item.y) < 5)
    if (!line) {
      line = { y: item.y, items: [] }
      lines.push(line)
    }
    line.items.push(item)
  })

  // Sort lines from top to bottom
  lines.sort((a, b) => b.y - a.y)

  // Sort items within each line from left to right
  lines.forEach(line => {
    line.items.sort((a, b) => a.x - b.x)
  })

  // 2. Find the header row to capture column centers
  let headerLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].items.map(it => it.text.toLowerCase()).join(' ')
    if (lineText.includes('product') && lineText.includes('brand') && lineText.includes('platform') && lineText.includes('price')) {
      headerLineIndex = i
      break
    }
  }

  const rows = []
  const errors = []

  if (headerLineIndex !== -1) {
    // Coordinate-based extraction
    let xProduct = null, xBrand = null, xPlatform = null, xPrice = null
    lines[headerLineIndex].items.forEach(item => {
      const txt = item.text.toLowerCase()
      if (txt.includes('product')) xProduct = item.x
      else if (txt.includes('brand')) xBrand = item.x
      else if (txt.includes('platform')) xPlatform = item.x
      else if (txt.includes('price')) xPrice = item.x
    })

    const colCenters = [
      { key: 'product', x: xProduct },
      { key: 'brand', x: xBrand },
      { key: 'platform', x: xPlatform },
      { key: 'basePrice', x: xPrice }
    ]

    // Fallback centers if not all header columns are resolved
    const foundCenters = colCenters.filter(c => c.x !== null).sort((a, b) => a.x - b.x)
    if (foundCenters.length < 4) {
      const headerItems = lines[headerLineIndex].items
      if (headerItems.length >= 4) {
        colCenters[0].x = headerItems[0].x
        colCenters[1].x = headerItems[1].x
        colCenters[2].x = headerItems[2].x
        colCenters[3].x = headerItems[headerItems.length - 1].x
      } else {
        colCenters[0].x = 50
        colCenters[1].x = 180
        colCenters[2].x = 300
        colCenters[3].x = 420
      }
    }

    const centers = colCenters.sort((a, b) => a.x - b.x)

    // Extract all rows below the header
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const line = lines[i]
      const lineText = line.items.map(it => it.text).join(' ')
      
      // Skip line breaks, orders info
      if (lineText.includes('───') || lineText.includes('===') || lineText.startsWith('Order #') || lineText.trim() === '') {
        continue
      }

      const rowValues = { product: [], brand: [], platform: [], basePrice: [] }

      line.items.forEach(item => {
        let closestColKey = 'product'
        let minDist = Infinity
        centers.forEach(c => {
          const dist = Math.abs(item.x - c.x)
          if (dist < minDist) {
            minDist = dist
            closestColKey = c.key
          }
        })
        rowValues[closestColKey].push(item.text)
      })

      rows.push({
        product: rowValues.product.join(' ').trim(),
        brand: rowValues.brand.join(' ').trim(),
        platform: rowValues.platform.join(' ').trim(),
        basePrice: rowValues.basePrice.join(' ').trim(),
        rowNum: i + 1
      })
    }
  } else {
    // Heuristic string fallback
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i].items.map(it => it.text).join(' ').trim()
      if (lineText.includes('───') || lineText.includes('===') || lineText.startsWith('Order #') || lineText.toLowerCase().includes('product brand') || lineText === '') {
        continue
      }

      const priceMatch = lineText.match(/Rs\.?\s*([\d,]+)$/i) || lineText.match(/₹\s*([\d,]+)$/i) || lineText.match(/([\d,]+)$/)
      if (!priceMatch) {
        errors.push(`Row ${i + 1}: could not extract raw price content from text: "${lineText}"`)
        continue
      }

      const priceStr = priceMatch[0]
      let textWithoutPrice = lineText.substring(0, lineText.lastIndexOf(priceMatch[0])).trim()
      
      const knownPlatforms = ['Amazon India', 'Flipkart', 'Noon']
      let platform = ''
      for (const p of knownPlatforms) {
        if (textWithoutPrice.endsWith(p)) {
          platform = p
          textWithoutPrice = textWithoutPrice.substring(0, textWithoutPrice.length - p.length).trim()
          break
        }
      }

      if (!platform) {
        const words = textWithoutPrice.split(' ')
        if (words.length > 0) platform = words.pop()
        textWithoutPrice = words.join(' ').trim()
      }

      const knownBrands = ['Natura Casa', 'LivSpace Pro', 'Nordic Basics']
      let brand = ''
      for (const b of knownBrands) {
        if (textWithoutPrice.endsWith(b)) {
          brand = b
          textWithoutPrice = textWithoutPrice.substring(0, textWithoutPrice.length - b.length).trim()
          break
        }
      }

      if (!brand) {
        const words = textWithoutPrice.split(' ')
        if (words.length > 0) brand = words.pop()
        textWithoutPrice = words.join(' ').trim()
      }

      rows.push({
        product: textWithoutPrice,
        brand,
        platform,
        basePrice: priceStr,
        rowNum: i + 1
      })
    }
  }

  return { rows, errors }
}
