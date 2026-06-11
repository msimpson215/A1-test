(function () {
  var VOICE_URL = '/voice/'
  var RETURN_KEY = 'a1-vox-returning'
  var STORAGE_VER = '4'
  var sessionActive = false
  var greetingFinished = false
  var closing = false
  var openedAt = 0
  var suppressClickUntil = 0
  var isTouchDevice = matchMedia('(pointer: coarse)').matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  try {
    if (sessionStorage.getItem('a1-vox-ver') !== STORAGE_VER) {
      sessionStorage.removeItem(RETURN_KEY)
      sessionStorage.setItem('a1-vox-ver', STORAGE_VER)
    }
  } catch (e) {}

  function iframe() {
    var o = document.getElementById('vox-overlay')
    if (!o) return null
    return document.getElementById('vox-iframe') || o.querySelector('iframe')
  }

  function overlayOpen() {
    var o = document.getElementById('vox-overlay')
    return !!(o && o.classList.contains('open'))
  }

  function post(frame, msg) {
    if (!frame || !frame.contentWindow) return
    var payload = typeof msg === 'string' ? { type: msg } : msg
    try {
      frame.contentWindow.postMessage(payload, '*')
    } catch (e) {}
  }

  function lockScroll(on) {
    document.body.style.overflow = on ? 'hidden' : ''
  }

  function ensureEnergyField() {
    var o = document.getElementById('vox-overlay')
    if (!o || o.querySelector('.vox-energy')) return
    var wrap = document.createElement('div')
    wrap.className = 'vox-energy'
    wrap.setAttribute('aria-hidden', 'true')
    wrap.innerHTML =
      '<span class="vox-pinwheel vox-pinwheel--bright"></span>' +
      '<span class="vox-pinwheel vox-pinwheel--soft"></span>'
    o.insertBefore(wrap, o.firstChild)
  }

  ensureEnergyField()

  function closeMobileMenu() {
    var menu = document.getElementById('mobileMenu')
    if (menu) menu.classList.remove('open')
  }

  /* Android/iOS: mic must be requested during the user's tap — prime before iframe loads */
  function primeMicFromGesture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      try {
        stream.getTracks().forEach(function (t) { t.stop() })
      } catch (e) {}
    }).catch(function () {})
  }

  function isVoxTrigger(el) {
    if (!el) return false
    return el.matches('[data-vox-open], .ai-nav, .ai-orb, #aiOrb')
  }

  function handleVoxOpen(e) {
    if (e && e.type === 'click' && Date.now() < suppressClickUntil) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    var trigger = e ? e.target.closest('a, button, [data-vox-open], .ai-orb, #aiOrb') : null
    if (e && !isVoxTrigger(trigger)) return

    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    closeMobileMenu()
    openVox()
  }

  document.addEventListener('pointerup', function (e) {
    if (!isVoxTrigger(e.target.closest('a, button, [data-vox-open], .ai-orb, #aiOrb'))) return
    if (e.pointerType === 'touch') suppressClickUntil = Date.now() + 700
    primeMicFromGesture()
    handleVoxOpen(e)
  }, true)

  document.addEventListener('click', function (e) {
    if (!isVoxTrigger(e.target.closest('a, button, [data-vox-open], .ai-orb, #aiOrb'))) return
    if (Date.now() < suppressClickUntil) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (isTouchDevice) return
    handleVoxOpen(e)
  }, true)

  window.openVox = function () {
    var o = document.getElementById('vox-overlay')
    if (!o || closing) return

    if (o.classList.contains('open')) {
      if (Date.now() - openedAt < 700) return
      closeVox()
      return
    }

    ensureEnergyField()
    greetingFinished = false
    o.classList.add('open')
    o.style.display = 'flex'
    lockScroll(true)
    openedAt = Date.now()

    var f = iframe()
    if (!f) return
    f.style.display = 'block'
    f.style.border = 'none'
    f.style.background = 'transparent'

    var returning = false
    try {
      returning = sessionStorage.getItem(RETURN_KEY) === '1'
    } catch (e) {}

    function start() {
      if (closing) return
      sessionActive = true
      post(f, {
        type: 'voxtalk-start',
        returning: returning,
        mobile: isTouchDevice
      })
    }

    f.onload = function () {
      f.setAttribute('data-vox-ready', '1')
      start()
    }

    f.removeAttribute('data-vox-ready')
    f.src = VOICE_URL
  }

  window.closeVox = function () {
    if (closing) return
    closing = true
    var markReturn = greetingFinished
    var f = iframe()

    function finishClose() {
      if (markReturn) {
        try { sessionStorage.setItem(RETURN_KEY, '1') } catch (e) {}
      }
      if (f) {
        post(f, 'voxtalk-stop')
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
      greetingFinished = false
      closing = false
    }

    finishClose()
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

    if (e.data.type === 'voxtalk-greeting-done') {
      greetingFinished = true
      return
    }

    if (e.data.type === 'voxtalk-close') {
      sessionActive = false
      if (!closing) closeVox()
    }
  })

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && overlayOpen()) closeVox()
  })

  window.addEventListener('pagehide', function () {
    if (overlayOpen()) closeVox()
  })

  window.addEventListener('popstate', function () {
    if (overlayOpen()) closeVox()
  })

  document.addEventListener('click', function (e) {
    var o = document.getElementById('vox-overlay')
    if (!o || !o.classList.contains('open')) return
    if (Date.now() - openedAt < 700) return
    if (o.contains(e.target)) return
    if (e.target.closest('[data-vox-open], .ai-nav, .ai-orb, #aiOrb')) return
    closeVox()
  }, true)

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]')
    if (!link || !overlayOpen()) return
    var href = (link.getAttribute('href') || '').trim()
    if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return
    closeVox()
  }, true)
})()
