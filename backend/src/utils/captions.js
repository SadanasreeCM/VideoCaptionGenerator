export function segmentFromWords(words) {
  const segments = []
  if (!words || words.length === 0) return segments

  let current = { start: 0, end: 0, text: '' }
  let wordCount = 0

  for (const w of words) {
    const start = Number(w.startTime.seconds || 0) + Number(w.startTime.nanos || 0) / 1e9
    const end = Number(w.endTime.seconds || 0) + Number(w.endTime.nanos || 0) / 1e9

    if (!current.text) {
      current.start = start
    }

    current.end = end
    current.text = `${current.text} ${w.word}`.trim()
    wordCount += 1

    const duration = current.end - current.start
    if (duration >= 3 || wordCount >= 12) {
      segments.push(current)
      current = { start: 0, end: 0, text: '' }
      wordCount = 0
    }
  }

  if (current.text) segments.push(current)
  return segments
}
