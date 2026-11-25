const $ = (id) => document.getElementById(id)
$('ver').textContent = 'Versi ' + chrome.runtime.getManifest().version
chrome.runtime.sendMessage({ type: 'status' }, (res) => {
  const s = res && res.ok ? res.data : null
  if (!s || !s.flowOpen) {
    $('d1').className = 'dot warn'
    $('s1').textContent = 'Tab Google Flow belum dibuka'
    $('s2').textContent = 'Buka Google Flow lalu login dengan akun Google-mu'
    return
  }
  $('d1').className = 'dot ' + (s.signedIn ? 'ok' : 'warn')
  $('s1').textContent = s.signedIn ? 'Google Flow terhubung' + (s.account ? ' · ' + s.account : '') : 'Google Flow terbuka, belum login'
  $('d2').className = 'dot ' + (s.projects.length ? 'ok' : '')
  $('s2').textContent = s.projects.length ? s.projects.length + ' project terbuka' : 'Buka sebuah project di Flow'
})
