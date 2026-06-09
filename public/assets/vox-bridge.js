(function () {
  var VOICE_URL = '/voice/'
  var sessionActive = false
  var closing = false

  function iframe() {
    var o = document.getElementById('vox-overlay')
    if (!o) return null
    return document.getElementById('vox-iframe') || o.querySelector('iframe')
  }

  function post(frame, type) {
    if (!frame || !frame.contentWindow) return
    try {
      frame.contentWindow.postMessage({ type: type }, '*')
    } catch (e) {}
  }

  function normalizeIframe(frame) {
    if (!frame) return
    frame.style.display = 'block'
    frame.style.position = ''
    frame.style.inset = ''
    frame.style.width = ''
    frame.style.height = ''
    frame.style.zIndex = ''
  }

  function lockScroll(on) {
    document.body.style.overflow = on ? 'hidden' : ''
  }

  window.openVox = function () {
    var o = document.getElementById('vox-overlay')
    if (!o || closing) return

    o.classList.add('open')
    o.style.display = window.getComputedStyle(o).display === 'flex' ? 'flex' : 'block'
    lockScroll(true)

    var f = iframe()
    if (!f) return
    normalizeIframe(f)

    function start() {
      if (sessionActive || closing) return
      sessionActive = true
      post(f, 'voxtalk-start')
    }

    if (f.getAttribute('data-vox-ready') === '1') {
      start()
      return
    }

    f.onload = function () {
      f.setAttribute('data-vox-ready', '1')
      start()
    }

    if (!f.src || f.src.indexOf('/voice') === -1) {
      f.src = VOICE_URL
    } else if (f.contentDocument && f.contentDocument.readyState === 'complete') {
      f.setAttribute('data-vox-ready', '1')
      start()
    }
  }

  window.closeVox = function () {
    if (closing) return
    closing = true

    var f = iframe()

    function finishClose() {
      if (f) {
        f.removeAttribute('data-vox-ready')
        f.src = 'about:blank'
        f.style.display = 'none'
      }
      var o = document.getElementById('vox-overlay')
      if (o) {
        o.style.display = 'none'
        o.classList.remove('open')
      }
      lockScroll(false)
      sessionActive = false
      closing = false
    }

    if (f && f.getAttribute('data-vox-ready') === '1' && sessionActive) {
      post(f, 'voxtalk-stop')
      setTimeout(finishClose, 450)
    } else {
      finishClose()
    }
  }

  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.type) return

    if (e.data.type === 'voxtalk-ready') {
      var f = iframe()
      if (f && f.contentWindow === e.source) {
        f.setAttribute('data-vox-ready', '1')
      }
      return
    }

    if (e.data.type === 'voxtalk-stopped') {
      sessionActive = false
      return
    }

    if (e.data.type === 'voxtalk-close') {
      sessionActive = false
      if (!closing) window.closeVox()
    }
  })
})()
