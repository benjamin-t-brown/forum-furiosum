(function () {
  'use strict';

  var STORAGE_KEY = 'ff_ephemeral_client_id';

  function uuidV4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getClientId() {
    var id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = uuidV4();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  function enableForm(form) {
    form.removeAttribute('disabled');
    var fields = form.querySelectorAll('textarea, button, input');
    for (var i = 0; i < fields.length; i++) {
      fields[i].disabled = false;
    }
  }

  function initEphemeralAuth(root) {
    var threadId = root.dataset.threadId;
    if (!threadId || root.dataset.replyApprovalTrust !== 'ephemeral') { return; }

    var form = root.querySelector('.ephemeral-reply-form');
    if (!form) { return; }

    var statusEl = root.querySelector('.ephemeral-auth-status');
    var basePath = document.body.getAttribute('data-base-path') || '';
    var loggedIn = document.body.getAttribute('data-logged-in') === '1';

    if (loggedIn && document.body.getAttribute('data-is-ephemeral') !== '1') {
      enableForm(form);
      return;
    }

    fetch(basePath + '/api/v1/auth/ephemeral/identify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ clientId: getClientId(), threadId: threadId }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok || !result.data.ok) {
          if (statusEl) { statusEl.textContent = 'Could not start anonymous session. Log in to reply.'; }
          return;
        }
        var username = result.data.data.user.username;
        document.body.setAttribute('data-logged-in', '1');
        document.body.setAttribute('data-is-ephemeral', '1');
        enableForm(form);
        if (statusEl) { statusEl.textContent = 'Posting as ' + username; }
      })
      .catch(function () {
        if (statusEl) { statusEl.textContent = 'Could not start anonymous session. Log in to reply.'; }
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('[data-thread-id][data-reply-approval-trust="ephemeral"]');
    if (root) { initEphemeralAuth(root); }
  });
})();
