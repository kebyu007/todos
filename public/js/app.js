/* App glue: theme toggle (Alpine) + modern date picker (flatpickr). */

// Alpine component for the navbar theme switch. The initial theme is already
// applied pre-paint by the inline <head> script — this just toggles + persists.
window.themeToggle = function () {
  return {
    dark: document.documentElement.getAttribute('data-theme') === 'dark',
    toggle() {
      this.dark = !this.dark;
      const theme = this.dark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem('theme', theme);
      } catch (e) {
        /* ignore */
      }
      // keep flatpickr calendars in sync with the new theme
      if (window.syncPickerTheme) window.syncPickerTheme();
    },
  };
};

(function () {
  function pickerConfig(el) {
    return {
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 5,
      dateFormat: 'Y-m-d\\TH:i', // submitted value (parsed by `new Date()`)
      altInput: true,
      altFormat: 'M j, Y · H:i', // friendly text shown to the user
      defaultDate: el.dataset.default || null,
      disableMobile: true, // use our themed picker, not the OS one
      monthSelectorType: 'static',
    };
  }

  // Initialize any not-yet-enhanced date inputs within `root`. We target the
  // [data-date] attribute (not a class) so flatpickr's generated alt-input —
  // which copies classes but not data attrs — is never re-initialized.
  function initPickers(root) {
    if (!window.flatpickr) return;
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-date]').forEach(function (el) {
      if (el._flatpickr) return;
      window.flatpickr(el, pickerConfig(el));
    });
  }

  // flatpickr reads --theme off the calendar; toggling data-theme is enough
  // because our CSS themes the calendar via [data-theme] selectors.
  window.syncPickerTheme = function () {};

  window.initPickers = initPickers;
  document.addEventListener('DOMContentLoaded', function () {
    initPickers(document);
  });
  // Re-init date inputs that arrive via HTMX (e.g. the inline edit form).
  document.body.addEventListener('htmx:afterSettle', function (e) {
    initPickers(e.target || document);
  });
})();
