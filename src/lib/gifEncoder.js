/**
 * Pure JS GIF89a encoder - no dependencies.
 * Builds a binary GIF from an array of ImageData frames.
 */

export class GifEncoder {
  constructor(width, height, delay = 100) {
    this.width = width
    this.height = height
    this.delay = delay // ms between frames
    this.frames = []
  }

  addFrame(imageData) {
    this.frames.push(imageData)
  }

  encode(onProgress) {
    const { width, height, delay, frames } = this
    const out = []

    // Quantize each frame to 256 colors using median-cut-lite
    const quantized = frames.map((frame, i) => {
      if (onProgress) onProgress(i, frames.length)
      return this._quantizeFrame(frame)
    })

    // GIF Header
    this._writeString(out, 'GIF89a')

    // Logical Screen Descriptor
    this._writeShort(out, width)
    this._writeShort(out, height)
    out.push(0x70) // GCT flag=0, color res=7, sort=0, size=0
    out.push(0x00) // bg color index
    out.push(0x00) // pixel aspect ratio

    // Netscape extension for looping
    out.push(0x21, 0xFF, 0x0B)
    this._writeString(out, 'NETSCAPE2.0')
    out.push(0x03, 0x01)
    this._writeShort(out, 0) // loop forever
    out.push(0x00)

    for (let i = 0; i < quantized.length; i++) {
      if (onProgress) onProgress(i, quantized.length)
      const { palette, indices } = quantized[i]

      // Graphic Control Extension
      out.push(0x21, 0xF9, 0x04)
      out.push(0x00) // no transparency
      this._writeShort(out, Math.round(delay / 10)) // delay in centiseconds
      out.push(0x00) // transparent color index
      out.push(0x00) // terminator

      // Image Descriptor
      out.push(0x2C)
      this._writeShort(out, 0) // left
      this._writeShort(out, 0) // top
      this._writeShort(out, width)
      this._writeShort(out, height)
      // Local color table, size = palette.length/3 entries
      const palSize = palette.length / 3
      const bits = Math.max(2, Math.ceil(Math.log2(palSize)))
      const tableSize = 1 << bits
      out.push(0x80 | (bits - 1)) // local color table flag + size

      // Write palette (pad to tableSize * 3)
      for (let j = 0; j < tableSize * 3; j++) {
        out.push(j < palette.length ? palette[j] : 0)
      }

      // LZW encode
      this._lzwEncode(out, indices, Math.max(2, bits))
    }

    // Trailer
    out.push(0x3B)

    return new Uint8Array(out)
  }

  _quantizeFrame(imageData) {
    const pixels = imageData.data
    const count = imageData.width * imageData.height

    // Build a histogram of unique colors (sample for speed)
    const colorMap = new Map()
    const step = count > 50000 ? 4 : 1
    for (let i = 0; i < count; i += step) {
      const off = i * 4
      // Reduce to 5 bits per channel for bucketing
      const r = pixels[off] >> 3
      const g = pixels[off + 1] >> 3
      const b = pixels[off + 2] >> 3
      const key = (r << 10) | (g << 5) | b
      colorMap.set(key, (colorMap.get(key) || 0) + 1)
    }

    // Get top 256 colors by frequency
    const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256)
    const palette = []
    const palLookup = new Map()
    for (let i = 0; i < sorted.length; i++) {
      const key = sorted[i][0]
      const r = ((key >> 10) & 31) << 3
      const g = ((key >> 5) & 31) << 3
      const b = (key & 31) << 3
      palette.push(r, g, b)
      palLookup.set(key, i)
    }

    // Map each pixel to nearest palette entry
    const indices = new Uint8Array(count)
    for (let i = 0; i < count; i++) {
      const off = i * 4
      const r = pixels[off] >> 3
      const g = pixels[off + 1] >> 3
      const b = pixels[off + 2] >> 3
      const key = (r << 10) | (g << 5) | b
      if (palLookup.has(key)) {
        indices[i] = palLookup.get(key)
      } else {
        // Find nearest
        let bestDist = Infinity, bestIdx = 0
        for (let j = 0; j < sorted.length; j++) {
          const pk = sorted[j][0]
          const pr = (pk >> 10) & 31, pg = (pk >> 5) & 31, pb = pk & 31
          const dr = r - pr, dg = g - pg, db = b - pb
          const d = dr * dr + dg * dg + db * db
          if (d < bestDist) { bestDist = d; bestIdx = j }
        }
        indices[i] = bestIdx
      }
    }

    return { palette, indices }
  }

  _lzwEncode(out, indices, minCodeSize) {
    const clearCode = 1 << minCodeSize
    const eoiCode = clearCode + 1

    let codeSize = minCodeSize + 1
    let nextCode = eoiCode + 1
    const maxTableSize = 4096
    let table = new Map()

    // Init table
    const initTable = () => {
      table.clear()
      for (let i = 0; i < clearCode; i++) table.set(String(i), i)
      nextCode = eoiCode + 1
      codeSize = minCodeSize + 1
    }

    out.push(minCodeSize) // LZW minimum code size

    const buffer = []
    let bits = 0
    let bitCount = 0

    const writeCode = (code) => {
      bits |= (code << bitCount)
      bitCount += codeSize
      while (bitCount >= 8) {
        buffer.push(bits & 0xFF)
        bits >>= 8
        bitCount -= 8
      }
    }

    initTable()
    writeCode(clearCode)

    if (indices.length === 0) {
      writeCode(eoiCode)
    } else {
      let current = String(indices[0])
      for (let i = 1; i < indices.length; i++) {
        const next = current + ',' + indices[i]
        if (table.has(next)) {
          current = next
        } else {
          writeCode(table.get(current))
          if (nextCode < maxTableSize) {
            table.set(next, nextCode++)
            if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++
          } else {
            writeCode(clearCode)
            initTable()
          }
          current = String(indices[i])
        }
      }
      writeCode(table.get(current))
    }

    writeCode(eoiCode)

    // Flush remaining bits
    if (bitCount > 0) buffer.push(bits & 0xFF)

    // Write sub-blocks (max 255 bytes each)
    let pos = 0
    while (pos < buffer.length) {
      const blockSize = Math.min(255, buffer.length - pos)
      out.push(blockSize)
      for (let i = 0; i < blockSize; i++) out.push(buffer[pos++])
    }
    out.push(0x00) // block terminator
  }

  _writeString(out, str) {
    for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i))
  }

  _writeShort(out, val) {
    out.push(val & 0xFF, (val >> 8) & 0xFF)
  }
}
