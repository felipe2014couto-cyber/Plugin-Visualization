(() => {
  const base = document.querySelector('base')?.getAttribute('href') ?? '/';
  const basePath = base.replace(/\/$/, '');
  let redirecting = false;

  const redirectPimsVisionDashboard = () => {
    const match = window.location.pathname.match(/^\/d\/([^/]+)/);
    if (!match || redirecting) {
      return;
    }

    const uid = decodeURIComponent(match[1]);
    redirecting = true;

    fetch(`${basePath}/api/dashboards/uid/${encodeURIComponent(uid)}`, { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : undefined)
      .then((payload) => {
        if (payload?.dashboard?.tags?.includes('pims-vision')) {
          window.location.replace(`${basePath}/a/pims-vision-app?dashboardUid=${encodeURIComponent(uid)}`);
        } else {
          redirecting = false;
        }
      })
      .catch(() => {
        redirecting = false;
      });
  };

  const originalPushState = window.history.pushState;
  window.history.pushState = function (...args) {
    originalPushState.apply(this, args);
    redirectPimsVisionDashboard();
  };

  const originalReplaceState = window.history.replaceState;
  window.history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    redirectPimsVisionDashboard();
  };

  window.addEventListener('popstate', redirectPimsVisionDashboard);
  redirectPimsVisionDashboard();
})();
