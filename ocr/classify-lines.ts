// ocr/classify-lines.ts

export function classifyLines(lines: string[]) {
  return lines.map(line => {
    const normalized = line
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

    return {
      raw: line,
      normalized
    }
  })
}
