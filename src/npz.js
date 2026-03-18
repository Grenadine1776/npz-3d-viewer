import JSZip from 'jszip'

const headerDecoder = new TextDecoder('ascii')
const NPY_MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]

function parseHeader(headerText) {
  const descrMatch = headerText.match(/'descr':\s*'([^']+)'/)
  const fortranMatch = headerText.match(/'fortran_order':\s*(True|False)/)
  const shapeMatch = headerText.match(/'shape':\s*\(([^)]*)\)/)

  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error('Unsupported NPY header format')
  }

  const shape = shapeMatch[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))

  return {
    descr: descrMatch[1],
    fortranOrder: fortranMatch[1] === 'True',
    shape,
  }
}

function product(shape) {
  return shape.reduce((total, value) => total * value, 1)
}

function parseUnicodeArray(view, byteOffset, count, itemSize) {
  const charCount = itemSize / 4
  const values = new Array(count)

  for (let i = 0; i < count; i += 1) {
    let text = ''
    const itemOffset = byteOffset + i * itemSize

    for (let j = 0; j < charCount; j += 1) {
      const codePoint = view.getUint32(itemOffset + j * 4, true)
      if (codePoint === 0) {
        break
      }
      text += String.fromCodePoint(codePoint)
    }

    values[i] = text
  }

  return values
}

function parseNumericArray(buffer, byteOffset, count, descr) {
  const kind = descr.at(-2)
  const bytesPerItem = Number.parseInt(descr.slice(2), 10)

  if (descr[0] !== '<' && descr[0] !== '|') {
    throw new Error(`Only little-endian NPY arrays are supported, got "${descr}"`)
  }

  if (kind === 'f' && bytesPerItem === 4) {
    return new Float32Array(buffer, byteOffset, count)
  }

  if (kind === 'f' && bytesPerItem === 8) {
    return new Float64Array(buffer, byteOffset, count)
  }

  if (kind === 'i' && bytesPerItem === 4) {
    return new Int32Array(buffer, byteOffset, count)
  }

  if (kind === 'u' && bytesPerItem === 4) {
    return new Uint32Array(buffer, byteOffset, count)
  }

  if (kind === 'b' && bytesPerItem === 1) {
    return Array.from(new Uint8Array(buffer, byteOffset, count), (value) => value !== 0)
  }

  throw new Error(`Unsupported dtype "${descr}"`)
}

export function parseNpy(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  const magic = new Uint8Array(arrayBuffer, 0, 6)

  if (!NPY_MAGIC.every((byte, index) => magic[index] === byte)) {
    throw new Error('Invalid NPY file')
  }

  const major = view.getUint8(6)
  let headerLength
  let headerOffset

  if (major === 1) {
    headerLength = view.getUint16(8, true)
    headerOffset = 10
  } else if (major === 2 || major === 3) {
    headerLength = view.getUint32(8, true)
    headerOffset = 12
  } else {
    throw new Error(`Unsupported NPY version ${major}`)
  }

  const headerText = headerDecoder.decode(new Uint8Array(arrayBuffer, headerOffset, headerLength))
  const { descr, fortranOrder, shape } = parseHeader(headerText)
  const byteOffset = headerOffset + headerLength
  const count = product(shape)

  if (fortranOrder) {
    throw new Error('Fortran-ordered arrays are not supported yet')
  }

  let data

  if (descr[1] === 'U') {
    const itemSize = Number.parseInt(descr.slice(2), 10) * 4
    data = parseUnicodeArray(view, byteOffset, count, itemSize)
  } else {
    data = parseNumericArray(arrayBuffer, byteOffset, count, descr)
  }

  return {
    dtype: descr,
    shape,
    count,
    data,
  }
}

export async function parseNpz(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const entries = {}

  for (const [filename, zipEntry] of Object.entries(zip.files)) {
    if (!filename.endsWith('.npy')) {
      continue
    }

    const key = filename.replace(/\.npy$/, '').split('/').pop()
    const npyBuffer = await zipEntry.async('arraybuffer')
    entries[key] = parseNpy(npyBuffer)
  }

  if (Object.keys(entries).length === 0) {
    throw new Error('No NPY arrays were found inside this NPZ file')
  }

  return entries
}

export function getValueAt(arrayInfo, index) {
  return arrayInfo.data[index]
}

export function getRow(arrayInfo, rowIndex) {
  if (arrayInfo.shape.length !== 2) {
    throw new Error('Row access expects a 2D array')
  }

  const [, cols] = arrayInfo.shape
  const start = rowIndex * cols
  const end = start + cols
  return arrayInfo.data.slice(start, end)
}
