/* Contemporary toast notifications.
 * Sources, all funneled into showToast():
 *   1. Server flash (full-page redirects)  -> #flash-data element in the layout
 *   2. HTMX success messages               -> HX-Trigger: { "toast": {...} }
 *   3. HTMX errors (4xx/5xx)               -> htmx:responseError, JSON { message }
 */
(function () {
  const ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info',
  };

  function ensureContainer() {
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      el.className = 'toast-container';
      document.body.appendChild(el);
    }
    return el;
  }

  function showToast(type, message, timeout = 4000) {
    if (!message) return;
    const kind = ICONS[type] ? type : 'info';
    const container = ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast--${kind}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      `<span class="toast__icon"><i class="fa-solid ${ICONS[kind]}"></i></span>` +
      `<span class="toast__msg"></span>` +
      `<button class="toast__close" aria-label="Dismiss">×</button>`;
    toast.querySelector('.toast__msg').textContent = message;

    const remove = () => {
      toast.classList.add('toast--out');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 400);
    };
    toast.querySelector('.toast__close').addEventListener('click', remove);

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast--in'));
    if (timeout) setTimeout(remove, timeout);
  }

  window.showToast = showToast;

  // 1. Server flash on initial page load.
  document.addEventListener('DOMContentLoaded', function () {
    const data = document.getElementById('flash-data');
    if (data && data.dataset.message) {
      showToast(data.dataset.type || 'info', data.dataset.message);
    }
  });

  // 2. HTMX success toast via HX-Trigger { toast: { type, message } }.
  document.body.addEventListener('toast', function (e) {
    if (e.detail) showToast(e.detail.type, e.detail.message);
  });

  // 3. HTMX error responses → toast the server message.
  document.body.addEventListener('htmx:responseError', function (e) {
    let message = 'Something went wrong';
    try {
      const body = JSON.parse(e.detail.xhr.responseText);
      if (body && body.message) message = body.message;
    } catch (_) {
      /* non-JSON error body */
    }
    showToast('error', message);
  });

  // Network failure (no response at all).
  document.body.addEventListener('htmx:sendError', function () {
    showToast('error', 'Network error — please check your connection');
  });
})();
