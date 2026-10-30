// X の「リンクをコピー」で付く追跡パラメータを、クリップボードに入る直前に消す。
// X がどの方法でコピーしても効くように、書き込み経路を全部フックする:
//   navigator.clipboard.writeText / .write、document.execCommand('copy')、navigator.share
const TRACKING = new Set(['s', 't', 'a', 'ref_src', 'ref_url', 'ref', 'src'])
const X_URL = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[^\s"'<>]+/g

function clean(text) {
  if (typeof text !== 'string') return text
  return text.replace(X_URL, (raw) => {
    try {
      const u = new URL(raw)
      for (const k of [...u.searchParams.keys()]) if (TRACKING.has(k)) u.searchParams.delete(k)
      return u.toString()
    } catch {
      return raw
    }
  })
}

const clip = navigator.clipboard
if (clip) {
  if (clip.writeText) {
    const orig = clip.writeText.bind(clip)
    clip.writeText = (text) => orig(clean(text))
  }
  if (clip.write && window.ClipboardItem) {
    const orig = clip.write.bind(clip)
    clip.write = async (items) => {
      const out = []
      for (const item of items) {
        const data = {}
        for (const type of item.types) {
          const blob = await item.getType(type)
          data[type] = type === 'text/plain' || type === 'text/html' ? new Blob([clean(await blob.text())], { type }) : blob
        }
        out.push(new ClipboardItem(data))
      }
      return orig(out)
    }
  }
}

// 隠し textarea を選択して execCommand('copy') する方式。copy イベントで中身を差し替える
const origExec = document.execCommand.bind(document)
document.execCommand = function (cmd, ...rest) {
  if (String(cmd).toLowerCase() !== 'copy') return origExec(cmd, ...rest)
  const onCopy = (e) => {
    const el = document.activeElement
    const text = el && typeof el.value === 'string' && el.selectionStart != null
      ? el.value.substring(el.selectionStart, el.selectionEnd) || el.value
      : String(getSelection())
    if (!text || !e.clipboardData) return
    e.clipboardData.setData('text/plain', clean(text))
    e.preventDefault()
  }
  document.addEventListener('copy', onCopy, { capture: true, once: true })
  try {
    return origExec(cmd, ...rest)
  } finally {
    document.removeEventListener('copy', onCopy, true)
  }
}

if (navigator.share) {
  const orig = navigator.share.bind(navigator)
  navigator.share = (data) => orig(data && data.url ? { ...data, url: clean(data.url) } : data)
}
