(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('.embed-thread');
    if (!root) { return; }

    var threadId = root.dataset.threadId;
    var draftKey = root.dataset.draftKey;
    var authReturnUrl = root.dataset.authReturnUrl;
    var loggedIn = document.body.dataset.loggedIn === '1';
    var textarea = document.getElementById('embed-compose-body');
    var form = document.getElementById('embed-compose-form');

    if (textarea && !textarea.value.trim()) {
      var saved = localStorage.getItem(draftKey);
      if (saved) { textarea.value = saved; }
    }

    if (textarea) {
      textarea.addEventListener('input', function () {
        localStorage.setItem(draftKey, textarea.value);
      });
    }

    function openAuthPopup(path) {
      if (textarea) { localStorage.setItem(draftKey, textarea.value); }
      var next = encodeURIComponent(authReturnUrl);
      window.open(path + '?next=' + next, 'forum_auth', 'width=480,height=640');
    }

    var loginBtn = document.getElementById('embed-login-btn');
    var registerBtn = document.getElementById('embed-register-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', function () { openAuthPopup('/login'); });
    }
    if (registerBtn) {
      registerBtn.addEventListener('click', function () { openAuthPopup('/register'); });
    }

    if (form && !loggedIn) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (textarea) { localStorage.setItem(draftKey, textarea.value); }
        openAuthPopup('/login');
      });
    }

    if (form && loggedIn) {
      form.addEventListener('submit', function () {
        localStorage.removeItem(draftKey);
      });
    }

    window.addEventListener('message', function (e) {
      if (!e.data || !e.data.type) { return; }
      if (e.data.threadId && e.data.threadId !== threadId) { return; }
      if (e.data.type === 'embed:auth-complete' || e.data.type === 'embed:posted') {
        localStorage.removeItem(draftKey);
        window.location.reload();
      }
    });
  });
})();
